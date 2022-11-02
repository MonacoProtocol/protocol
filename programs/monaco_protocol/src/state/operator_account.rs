use crate::state::type_size::*;
use anchor_lang::prelude::*;
use std::result::Result;
use std::str::FromStr;

#[account]
#[derive(Default)]
pub struct AuthorisedOperators {
    pub authority: Pubkey,
    pub operator_list: Vec<Pubkey>,
}

impl AuthorisedOperators {
    pub fn contains(&self, operator: &Pubkey) -> bool {
        self.operator_list.contains(operator)
    }
    pub fn insert(&mut self, operator: Pubkey) -> bool {
        if !self.contains(&operator) {
            let list_len = self.operator_list.len();
            if list_len >= AuthorisedOperators::LIST_LENGTH {
                return false;
            }
            self.operator_list.push(operator);
        }
        true
    }

    pub fn remove(&mut self, operator: Pubkey) {
        while let Some(index) = self
            .operator_list
            .iter()
            .position(|item| (*item).eq(&operator))
        {
            self.operator_list.remove(index);
        }
    }

    const LIST_LENGTH: usize = 31;
    pub const SIZE: usize = DISCRIMINATOR_SIZE
        + PUB_KEY_SIZE // authority
        + vec_size(PUB_KEY_SIZE, AuthorisedOperators::LIST_LENGTH); // operator_list
}

#[cfg(test)]
mod tests {
    use crate::AuthorisedOperators;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn test_contains_present() {
        let operator = Pubkey::new_unique();
        let account = AuthorisedOperators {
            operator_list: vec![operator],
            ..Default::default()
        };
        assert!(account.contains(&operator));
    }

    #[test]
    fn test_contains_not_present() {
        let operator = Pubkey::new_unique();
        let other_operator = Pubkey::new_unique();
        let account = AuthorisedOperators {
            operator_list: vec![operator],
            ..Default::default()
        };
        assert!(!account.contains(&other_operator));
    }

    #[test]
    fn test_insert_success() {
        let operator = Pubkey::new_unique();
        let mut account = AuthorisedOperators {
            operator_list: Vec::new(),
            ..Default::default()
        };
        assert!(account.insert(operator));
        assert_eq!(account.operator_list, vec![operator]);
    }

    #[test]
    fn test_insert_duplicate_success() {
        let operator = Pubkey::new_unique();
        let mut account = AuthorisedOperators {
            operator_list: Vec::new(),
            ..Default::default()
        };
        assert!(account.insert(operator));
        assert!(account.insert(operator));
        assert_eq!(account.operator_list, vec![operator]);
    }

    #[test]
    fn test_insert_full_failure() {
        let mut account = AuthorisedOperators {
            operator_list: Vec::new(),
            ..Default::default()
        };
        for _ in 0..AuthorisedOperators::LIST_LENGTH {
            account.insert(Pubkey::new_unique());
        }
        assert_eq!(
            account.operator_list.len(),
            AuthorisedOperators::LIST_LENGTH
        );
        assert!(!account.insert(Pubkey::new_unique()));
    }

    #[test]
    fn test_remove_success() {
        let operator = Pubkey::new_unique();
        let mut account = AuthorisedOperators {
            operator_list: vec![operator],
            ..Default::default()
        };
        account.remove(operator);
        assert_eq!(account.operator_list, vec![]);
    }

    #[test]
    fn test_remove_subsequent_success() {
        let operator0 = Pubkey::new_unique();
        let operator1 = operator0;
        let operator2 = Pubkey::new_unique();
        let operator3 = operator0;
        let operator4 = Pubkey::new_unique();

        let mut account = AuthorisedOperators {
            operator_list: vec![operator0, operator1, operator2, operator3, operator4],
            ..Default::default()
        };
        account.remove(operator0);
        assert_eq!(account.operator_list, vec![operator2, operator4]);
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Debug, Clone, PartialEq, Eq)]
pub enum OperatorType {
    Admin,
    Crank,
    Market,
}

impl FromStr for OperatorType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "ADMIN" => Ok(OperatorType::Admin),
            "CRANK" => Ok(OperatorType::Crank),
            "MARKET" => Ok(OperatorType::Market),
            _ => Err(()),
        }
    }
}
