use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseItemInputDto {
    pub product_id: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
    pub unit_cost_paisa: i64, // pack cost in Paisas
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordPurchaseDto {
    pub supplier_id: i64,
    pub invoice_no: String,
    pub supplier_invoice_no: Option<String>,
    pub purchase_date: String,
    pub items: Vec<PurchaseItemInputDto>,
    pub freight_paisa: Option<i64>,
    pub unloading_labor_paisa: Option<i64>,
    pub transit_tax_paisa: Option<i64>,
    pub payment_status: String, // "PAID", "PARTIAL", "UNPAID"
    pub payment_mode: Option<String>, // "CASH", "CREDIT", "BANK", "SPLIT"
    pub paid_amount_paisa: Option<i64>,
    pub empty_crates_returned_to_factory: Option<i64>,
    pub notes: Option<String>,
    pub user_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordPurchaseResult {
    pub purchase_id: i64,
    pub purchase_number: String,
    pub base_invoice_cost_paisa: i64,
    pub total_landed_cost_paisa: i64,
    pub paid_amount_paisa: i64,
    pub due_amount_paisa: i64,
    pub new_supplier_payable_paisa: i64,
    pub journal_entry_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LandedCostAllocatedItemDto {
    pub product_id: i64,
    pub product_name: String,
    pub units_per_pack: i64,
    pub pack_qty: i64,
    pub loose_qty: i64,
    pub total_base_units: i64,
    pub base_goods_total_paisa: i64,
    pub allocated_landed_cost_paisa: i64,
    pub final_unit_landed_cost_paisa: i64,
    pub final_pack_landed_cost_paisa: i64,
    pub line_total_paisa: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LandedCostBreakdownDto {
    pub base_goods_total_paisa: i64,
    pub freight_paisa: i64,
    pub unloading_labor_paisa: i64,
    pub transit_tax_paisa: i64,
    pub total_additional_costs_paisa: i64,
    pub total_landed_cost_paisa: i64,
    pub items: Vec<LandedCostAllocatedItemDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PurchaseInvoiceListItemDto {
    pub id: i64,
    pub purchase_number: String,
    pub supplier_id: i64,
    pub supplier_name: String,
    pub purchase_date: String,
    pub base_goods_paisa: i64,
    pub freight_paisa: i64,
    pub unloading_labor_paisa: i64,
    pub total_landed_cost_paisa: i64,
    pub paid_amount_paisa: i64,
    pub due_amount_paisa: i64,
    pub payment_status: String,
    pub is_locked: bool,
    pub created_at: String,
}

pub struct PurchaseService;
pub type PurchasesService = PurchaseService;

impl PurchaseService {
    pub fn record_purchase(
        conn: &mut Connection,
        req: RecordPurchaseDto,
    ) -> Result<RecordPurchaseResult, AppError> {
        // 1. Validations
        if req.items.is_empty() {
            return Err(AppError::Validation(
                "Purchase invoice must contain at least one item".into(),
            ));
        }
        let freight = req.freight_paisa.unwrap_or(0);
        let unloading = req.unloading_labor_paisa.unwrap_or(0);
        let transit_tax = req.transit_tax_paisa.unwrap_or(0);
        if freight < 0 || unloading < 0 || transit_tax < 0 {
            return Err(AppError::Validation(
                "Direct expenses cannot be negative".into(),
            ));
        }

        let user_id = req.user_id.unwrap_or(1);
        let tx = conn.transaction()?;

        // Day-locking guard: Check if daily closing is already locked for purchase_date
        let is_date_locked: bool = tx
            .query_row(
                "SELECT COUNT(*) FROM daily_closings WHERE closing_date = ?1 AND is_locked = 1",
                params![req.purchase_date],
                |r| Ok(r.get::<_, i64>(0)? > 0),
            )
            .unwrap_or(false);

        if is_date_locked {
            return Err(AppError::DayLocked(format!(
                "Accounting date {} is locked by finalized daily closing",
                req.purchase_date
            )));
        }

        // Verify supplier exists
        let (current_payable_paisa, current_payable): (i64, i64) = tx
            .query_row(
                "SELECT current_payable_paisa, current_payable FROM suppliers WHERE id = ?1",
                params![req.supplier_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound {
                entity: "Supplier".to_string(),
                id: req.supplier_id.to_string(),
            })?;

        // 2. Prepare items & compute base goods cost
        let mut prepared = Vec::new();
        let mut total_base_goods_paisa: i64 = 0;

        for it in &req.items {
            if it.unit_cost_paisa < 0 {
                return Err(AppError::Validation("Unit cost cannot be negative".into()));
            }
            if it.pack_qty < 0 || it.loose_qty < 0 {
                return Err(AppError::Validation(
                    "Quantities cannot be negative".into(),
                ));
            }

            let (name, units_per_pack, current_stock): (String, i64, i64) = tx
                .query_row(
                    "SELECT name, units_per_pack, current_stock_base_units FROM products WHERE id = ?1",
                    params![it.product_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::NotFound {
                    entity: "Product".to_string(),
                    id: it.product_id.to_string(),
                })?;

            let total_base_units = (it.pack_qty * units_per_pack) + it.loose_qty;
            if total_base_units <= 0 {
                return Err(AppError::Validation(
                    "Item base units must be positive".into(),
                ));
            }

            // Line base cost = effective packs * pack cost
            let line_base_goods_paisa = if units_per_pack > 0 {
                let base_unit_cost = it.unit_cost_paisa / units_per_pack;
                (it.pack_qty * it.unit_cost_paisa) + (it.loose_qty * base_unit_cost)
            } else {
                0
            };

            total_base_goods_paisa += line_base_goods_paisa;
            prepared.push((
                it,
                name,
                units_per_pack,
                total_base_units,
                line_base_goods_paisa,
                current_stock,
            ));
        }

        let total_direct_expenses_paisa = freight + unloading + transit_tax;
        let total_landed_cost_paisa = total_base_goods_paisa + total_direct_expenses_paisa;

        let paid_paisa = req.paid_amount_paisa.unwrap_or(0);
        let due_paisa = (total_landed_cost_paisa - paid_paisa).max(0);

        // 3. Apportion landed costs across line items with zero-drift remainder distribution
        let num_items = prepared.len();
        let mut allocated_sum: i64 = 0;
        let mut items_with_landed = Vec::new();

        for (idx, (it, name, units_per_pack, total_base_units, line_base, current_stock)) in
            prepared.iter().enumerate()
        {
            let allocated_paisa = if idx == num_items - 1 {
                // Remainder catch-up guarantees sum == total_direct_expenses_paisa
                total_direct_expenses_paisa - allocated_sum
            } else if total_base_goods_paisa > 0 {
                ((*line_base as f64 / total_base_goods_paisa as f64)
                    * total_direct_expenses_paisa as f64)
                    .floor() as i64
            } else {
                total_direct_expenses_paisa / num_items as i64
            };
            allocated_sum += allocated_paisa;

            let line_total_landed_paisa = line_base + allocated_paisa;
            let final_unit_landed_cost_paisa = if *total_base_units > 0 {
                line_total_landed_paisa / total_base_units
            } else {
                0
            };
            let final_pack_landed_cost_paisa =
                final_unit_landed_cost_paisa * units_per_pack;

            items_with_landed.push((
                *it,
                name.clone(),
                *units_per_pack,
                *total_base_units,
                *line_base,
                allocated_paisa,
                line_total_landed_paisa,
                final_unit_landed_cost_paisa,
                final_pack_landed_cost_paisa,
                *current_stock,
            ));
        }

        // 4. Insert purchase_invoices header
        let purchase_num = if req.invoice_no.trim().is_empty() {
            format!("PUR-{}", Uuid::new_v4().to_string()[..8].to_uppercase())
        } else {
            req.invoice_no.clone()
        };

        tx.execute(
            "INSERT INTO purchase_invoices (
                purchase_number, purchase_invoice_no, supplier_invoice_no, supplier_id,
                purchase_date, base_goods_paisa, base_invoice_cost, freight_paisa, freight_expense,
                unloading_labor_paisa, unloading_labor_expense, transit_tax_paisa, transit_tax_expense,
                total_landed_cost_paisa, total_landed_cost, paid_amount_paisa, paid_amount,
                due_amount_paisa, due_amount, payment_status, payment_mode,
                empty_crates_returned_to_factory, notes, created_by
             ) VALUES (
                ?1, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
                ?19, ?20, ?21, ?22, ?23
             )",
            params![
                purchase_num,
                req.supplier_invoice_no.clone().unwrap_or_default(),
                req.supplier_id,
                req.purchase_date,
                total_base_goods_paisa,
                total_base_goods_paisa / 100,
                freight,
                freight / 100,
                unloading,
                unloading / 100,
                transit_tax,
                transit_tax / 100,
                total_landed_cost_paisa,
                total_landed_cost_paisa / 100,
                paid_paisa,
                paid_paisa / 100,
                due_paisa,
                due_paisa / 100,
                req.payment_status,
                req.payment_mode
                    .clone()
                    .unwrap_or_else(|| "CREDIT".to_string()),
                req.empty_crates_returned_to_factory.unwrap_or(0),
                req.notes,
                user_id
            ],
        )?;
        let purchase_id = tx.last_insert_rowid();

        // Compatibility insert into purchases table
        let _ = tx.execute(
            "INSERT INTO purchases (
                purchase_invoice_no, supplier_id, purchase_date, base_invoice_cost,
                freight_expense, unloading_labor_expense, transit_tax_expense,
                total_landed_cost, payment_status, paid_amount, due_amount
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                purchase_num,
                req.supplier_id,
                req.purchase_date,
                total_base_goods_paisa / 100,
                freight / 100,
                unloading / 100,
                transit_tax / 100,
                total_landed_cost_paisa / 100,
                req.payment_status,
                paid_paisa / 100,
                due_paisa / 100
            ],
        );

        // 5. Insert line items & increment physical stock
        for (
            it,
            _name,
            units_per_pack,
            total_base_units,
            _line_base,
            allocated,
            line_landed,
            unit_landed,
            pack_landed,
            current_stock,
        ) in &items_with_landed
        {
            tx.execute(
                "INSERT INTO purchase_invoice_items (
                    purchase_id, product_id, pack_qty, loose_qty, total_base_units,
                    pack_purchase_rate_paisa, base_purchase_rate_paisa, landed_cost_allocated_paisa,
                    final_unit_landed_cost_paisa, line_total_paisa
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    purchase_id,
                    it.product_id,
                    it.pack_qty,
                    it.loose_qty,
                    total_base_units,
                    it.unit_cost_paisa,
                    if *units_per_pack > 0 {
                        it.unit_cost_paisa / units_per_pack
                    } else {
                        0
                    },
                    allocated,
                    unit_landed,
                    line_landed
                ],
            )?;

            // Increment stock & update purchase price
            let new_stock = current_stock + total_base_units;
            tx.execute(
                "UPDATE products SET 
                    stock_base_units = ?1,
                    current_stock_base_units = ?1,
                    purchase_price_pack_paisa = ?2,
                    purchase_price_pack = ?3,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?4",
                params![
                    new_stock,
                    pack_landed,
                    pack_landed / 100,
                    it.product_id
                ],
            )?;

            // Sync main warehouse location
            tx.execute(
                "INSERT INTO product_location_balances (product_id, location_id, balance_base_units, updated_at)
                 VALUES (?1, 1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                 ON CONFLICT(product_id, location_id) DO UPDATE SET
                    balance_base_units = balance_base_units + ?2,
                    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                params![it.product_id, total_base_units],
            )?;

            // Stock movement
            let mov_code = format!("MOV-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
            tx.execute(
                "INSERT INTO stock_movements (
                    movement_code, product_id, movement_type, to_location_id,
                    delta_base_units, quantity_base_units, pack_qty, loose_qty,
                    unit_cost_paisa, total_cost_paisa, previous_stock_base_units,
                    new_stock_base_units, reference_type, reference_doc_type,
                    reference_doc_id, reference_doc_number, created_by
                 ) VALUES (?1, ?2, 'PURCHASE', 1, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'PURCHASE', 'PURCHASE_INVOICE', ?11, ?12, ?13)",
                params![
                    mov_code,
                    it.product_id,
                    total_base_units,
                    total_base_units,
                    it.pack_qty,
                    it.loose_qty,
                    unit_landed,
                    line_landed,
                    current_stock,
                    new_stock,
                    purchase_id,
                    purchase_num,
                    user_id
                ],
            )?;
        }

        // 6. Update Supplier Payables & Ledger
        let new_payable_paisa = current_payable_paisa + due_paisa;
        let new_payable = current_payable + (due_paisa / 100);

        tx.execute(
            "UPDATE suppliers SET 
                current_payable_paisa = ?1,
                current_payable = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?3",
            params![new_payable_paisa, new_payable, req.supplier_id],
        )?;

        // Dedicated Supplier Ledger
        let _ = tx.execute(
            "INSERT INTO supplier_ledger (
                supplier_id, entry_date, voucher_type, voucher_ref_id,
                description, debit, credit, running_balance
             ) VALUES (?1, ?2, 'PURCHASE', ?3, ?4, ?5, ?6, ?7)",
            params![
                req.supplier_id,
                req.purchase_date,
                purchase_id,
                format!("Purchase Invoice {}", purchase_num),
                paid_paisa / 100,
                total_landed_cost_paisa / 100,
                new_payable
            ],
        );

        // 7. Cash Book outflow if cash was paid
        if paid_paisa > 0 {
            let prev_cash: i64 = tx
                .query_row(
                    "SELECT running_balance_paisa FROM cash_book ORDER BY id DESC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .unwrap_or(0);
            let new_cash = prev_cash - paid_paisa;

            tx.execute(
                "INSERT INTO cash_book (
                    entry_date, transaction_type, voucher_ref_type, voucher_ref_number,
                    account_id, account_code, particulars, description,
                    cash_in, cash_in_paisa, cash_out, cash_out_paisa,
                    running_balance_paisa, running_cash_balance, created_by
                 ) VALUES (?1, 'SUPPLIER_PAYMENT', 'PURCHASE', ?2, 13, '2010',
                          'Supplier Consignment Payment', ?3, 0, 0, ?4, ?5, ?6, ?7, ?8)",
                params![
                    req.purchase_date,
                    purchase_num,
                    format!("Payment for inward purchase {}", purchase_num),
                    paid_paisa / 100,
                    paid_paisa,
                    new_cash,
                    new_cash / 100,
                    user_id
                ],
            )?;
        }

        // 8. Handle factory empties returned
        let empties_returned = req.empty_crates_returned_to_factory.unwrap_or(0);
        if empties_returned > 0 {
            tx.execute(
                "UPDATE products SET empty_crates_stock = empty_crates_stock - ?1 WHERE packaging_type = 'RGB_GLASS'",
                params![empties_returned],
            )?;

            tx.execute(
                "UPDATE suppliers SET crates_owed_to_company = crates_owed_to_company - ?1 WHERE id = ?2",
                params![empties_returned, req.supplier_id],
            )?;

            let _ = tx.execute(
                "INSERT INTO empties_ledger (
                    entity_type, entity_id, entry_date, voucher_type, voucher_number,
                    crates_out, crates_in, running_crates_balance, notes, created_by
                 ) VALUES ('SUPPLIER', ?1, ?2, 'FACTORY_RETURN', ?3, ?4, 0, 0, 'Factory truck empties handover', ?5)",
                params![
                    req.supplier_id,
                    req.purchase_date,
                    purchase_num,
                    empties_returned,
                    user_id
                ],
            );
        }

        // 9. Balanced Double-Entry Journal Voucher
        let je_num = format!("JE-PUR-{}", Uuid::new_v4().to_string()[..8].to_uppercase());
        tx.execute(
            "INSERT INTO journal_entries (entry_number, entry_date, voucher_type, reference_doc_type, reference_doc_id, narration, is_balanced, created_by)
             VALUES (?1, ?2, 'PURCHASE', 'PURCHASE_INVOICE', ?3, ?4, 1, ?5)",
            params![
                je_num,
                req.purchase_date,
                purchase_id,
                format!("Capitalized inward purchase {}: landed inventory", purchase_num),
                user_id
            ],
        )?;
        let je_id = tx.last_insert_rowid();

        // Line 1: Dr 1100 Inventory - Liquid Beverages (Acct ID 5) -> Total Landed Cost
        tx.execute(
            "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
             VALUES (?1, 5, ?2, 0, 'Capitalized Landed Inventory Asset')",
            params![je_id, total_landed_cost_paisa],
        )?;

        // Line 2: Cr 2010 Accounts Payable - Suppliers (Acct ID 13) -> Due amount (if unpaid)
        if due_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration, supplier_id)
                 VALUES (?1, 13, 0, ?2, 'Supplier payable liability', ?3)",
                params![je_id, due_paisa, req.supplier_id],
            )?;
        }

        // Line 3: Cr 1010 Cash on Hand (Acct ID 2) -> Paid amount
        if paid_paisa > 0 {
            tx.execute(
                "INSERT INTO journal_lines (entry_id, account_id, debit_paisa, credit_paisa, line_narration)
                 VALUES (?1, 2, 0, ?2, 'Cash paid on purchase')",
                params![je_id, paid_paisa],
            )?;
        }

        tx.commit()?;

        Ok(RecordPurchaseResult {
            purchase_id,
            purchase_number: purchase_num,
            base_invoice_cost_paisa: total_base_goods_paisa,
            total_landed_cost_paisa,
            paid_amount_paisa: paid_paisa,
            due_amount_paisa: due_paisa,
            new_supplier_payable_paisa: new_payable_paisa,
            journal_entry_id: je_id,
        })
    }

    pub fn calculate_landed_cost_preview(
        conn: &Connection,
        items: &[PurchaseItemInputDto],
        freight_paisa: i64,
        unloading_labor_paisa: i64,
        transit_tax_paisa: i64,
    ) -> Result<LandedCostBreakdownDto, AppError> {
        let mut total_base_goods = 0;
        let mut prepared = Vec::new();

        for it in items {
            let (name, units_per_pack): (String, i64) = conn
                .query_row(
                    "SELECT name, units_per_pack FROM products WHERE id = ?1",
                    params![it.product_id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?
                .ok_or_else(|| AppError::NotFound {
                    entity: "Product".into(),
                    id: it.product_id.to_string(),
                })?;

            let total_base_units = (it.pack_qty * units_per_pack) + it.loose_qty;
            let base_cost = if units_per_pack > 0 {
                let base_rate = it.unit_cost_paisa / units_per_pack;
                (it.pack_qty * it.unit_cost_paisa) + (it.loose_qty * base_rate)
            } else {
                0
            };
            total_base_goods += base_cost;
            prepared.push((it, name, units_per_pack, total_base_units, base_cost));
        }

        let total_additional = freight_paisa + unloading_labor_paisa + transit_tax_paisa;
        let total_landed = total_base_goods + total_additional;

        let num_items = prepared.len();
        let mut allocated_sum = 0;
        let mut allocated_items = Vec::new();

        for (idx, (it, name, units_per_pack, total_base, base_cost)) in prepared.iter().enumerate()
        {
            let allocated = if idx == num_items - 1 {
                total_additional - allocated_sum
            } else if total_base_goods > 0 {
                ((*base_cost as f64 / total_base_goods as f64) * total_additional as f64).floor()
                    as i64
            } else {
                total_additional / (num_items as i64).max(1)
            };
            allocated_sum += allocated;

            let line_total = base_cost + allocated;
            let unit_landed = if *total_base > 0 {
                line_total / total_base
            } else {
                0
            };
            let pack_landed = unit_landed * units_per_pack;

            allocated_items.push(LandedCostAllocatedItemDto {
                product_id: it.product_id,
                product_name: name.clone(),
                units_per_pack: *units_per_pack,
                pack_qty: it.pack_qty,
                loose_qty: it.loose_qty,
                total_base_units: *total_base,
                base_goods_total_paisa: *base_cost,
                allocated_landed_cost_paisa: allocated,
                final_unit_landed_cost_paisa: unit_landed,
                final_pack_landed_cost_paisa: pack_landed,
                line_total_paisa: line_total,
            });
        }

        Ok(LandedCostBreakdownDto {
            base_goods_total_paisa: total_base_goods,
            freight_paisa,
            unloading_labor_paisa,
            transit_tax_paisa,
            total_additional_costs_paisa: total_additional,
            total_landed_cost_paisa: total_landed,
            items: allocated_items,
        })
    }

    pub fn list_purchases(
        conn: &Connection,
        limit: Option<usize>,
    ) -> Result<Vec<PurchaseInvoiceListItemDto>, AppError> {
        let max_rows = limit.unwrap_or(50);
        let mut stmt = conn.prepare(
            "SELECT pi.id, pi.purchase_number, pi.supplier_id, s.name, pi.purchase_date,
                    pi.base_goods_paisa, pi.freight_paisa, pi.unloading_labor_paisa,
                    pi.total_landed_cost_paisa, pi.paid_amount_paisa, pi.due_amount_paisa,
                    pi.payment_status, pi.is_locked, pi.created_at
             FROM purchase_invoices pi
             JOIN suppliers s ON pi.supplier_id = s.id
             ORDER BY pi.id DESC LIMIT ?1",
        )?;

        let list = stmt
            .query_map(params![max_rows as i64], |r| {
                Ok(PurchaseInvoiceListItemDto {
                    id: r.get(0)?,
                    purchase_number: r.get(1)?,
                    supplier_id: r.get(2)?,
                    supplier_name: r.get(3)?,
                    purchase_date: r.get(4)?,
                    base_goods_paisa: r.get(5)?,
                    freight_paisa: r.get(6)?,
                    unloading_labor_paisa: r.get(7)?,
                    total_landed_cost_paisa: r.get(8)?,
                    paid_amount_paisa: r.get(9)?,
                    due_amount_paisa: r.get(10)?,
                    payment_status: r.get(11)?,
                    is_locked: r.get::<_, i32>(12)? == 1,
                    created_at: r.get(13)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        Ok(list)
    }
}
