use serde::{Deserialize, Serialize};

/// Type alias representing exact currency in Pakistani Paisas (1 PKR = 100 Paisas).
/// We strictly use 64-bit signed integers to eliminate IEEE 754 floating-point rounding drift.
pub type Paisa = i64;

/// Converts a decimal PKR amount (e.g. from user input) to integer Paisas.
pub fn pkr_to_paisa(pkr: f64) -> Paisa {
    (pkr * 100.0).round() as Paisa
}

/// Converts integer Paisas to floating point PKR for reporting/display purposes.
pub fn paisa_to_pkr(paisa: Paisa) -> f64 {
    paisa as f64 / 100.0
}

/// Formats integer Paisas as a standard Pakistani Rupee string (e.g. "₨ 50,000.00").
pub fn format_pkr(paisa: Paisa) -> String {
    let pkr = paisa_to_pkr(paisa);
    if paisa < 0 {
        format!("-₨ {:.2}", pkr.abs())
    } else {
        format!("₨ {:.2}", pkr)
    }
}

/// Wrapper value object for safe monetary operations
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default, Serialize, Deserialize)]
pub struct Money(pub Paisa);

impl Money {
    pub const ZERO: Money = Money(0);

    pub fn from_pkr(pkr: f64) -> Self {
        Money(pkr_to_paisa(pkr))
    }

    pub fn from_paisa(paisa: Paisa) -> Self {
        Money(paisa)
    }

    pub fn as_paisa(&self) -> Paisa {
        self.0
    }

    pub fn as_pkr(&self) -> f64 {
        paisa_to_pkr(self.0)
    }

    pub fn format(&self) -> String {
        format_pkr(self.0)
    }
}

impl std::ops::Add for Money {
    type Output = Self;
    fn add(self, rhs: Self) -> Self::Output {
        Money(self.0 + rhs.0)
    }
}

impl std::ops::Sub for Money {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self::Output {
        Money(self.0 - rhs.0)
    }
}

impl std::ops::Mul<i64> for Money {
    type Output = Self;
    fn mul(self, rhs: i64) -> Self::Output {
        Money(self.0 * rhs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkr_paisa_conversion() {
        assert_eq!(pkr_to_paisa(50000.0), 5_000_000);
        assert_eq!(pkr_to_paisa(12.50), 1250);
        assert_eq!(paisa_to_pkr(5_000_000), 50000.0);
        assert_eq!(format_pkr(5_000_000), "₨ 50000.00");
    }

    #[test]
    fn test_zero_drift_arithmetic() {
        let m1 = Money::from_pkr(10.10);
        let m2 = Money::from_pkr(20.20);
        let m3 = m1 + m2;
        assert_eq!(m3.as_paisa(), 3030);
        assert_eq!(m3.as_pkr(), 30.30);
    }
}
