use crate::context::AuthoriseOperator;
use crate::error::CoreError;
use crate::state::operator_account::OperatorType;
use crate::AuthorisedOperators;
use anchor_lang::prelude::*;
use solana_program::pubkey::Pubkey;
use std::str::FromStr;

pub fn authorise_operator(
    authority: Pubkey,
    authorised_operators: &mut Account<AuthorisedOperators>,
    operator: Pubkey,
    operator_type: String,
) -> Result<()> {
    validate_operator_type(operator_type)?;

    // TODO This field is redundant
    authorised_operators.authority = authority.key();
    let result = authorised_operators.insert(operator);
    require!(result, CoreError::AuthorisedOperatorListFull);
    Ok(())
}

pub fn remove_authorised_operator(
    ctx: Context<AuthoriseOperator>,
    operator: Pubkey,
    operator_type_string: String,
) -> Result<()> {
    validate_operator_type(operator_type_string)?;
    ctx.accounts.authorised_operators.remove(operator);
    Ok(())
}

pub fn verify_operator_authority(
    operator: &Pubkey,
    authorised_operators: &AuthorisedOperators,
) -> Result<()> {
    if !authorised_operators.contains(operator) {
        msg!("Operator is not authorised to carry out this operation.");
        return Err(error!(CoreError::UnauthorisedOperator));
    }
    Ok(())
}

fn validate_operator_type(operator_type: String) -> Result<()> {
    let result = OperatorType::from_str(&operator_type);
    require!(result.is_ok(), CoreError::InvalidOperatorType);
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::instructions::operator::validate_operator_type;

    #[test]
    fn valid_operator_type() {
        let result = validate_operator_type(String::from("CRANK"));
        assert!(result.is_ok())
    }

    #[test]
    fn invalid_operator_type() {
        let result = validate_operator_type(String::from("CraNK"));
        assert!(result.is_err())
    }

    #[test]
    fn valid_operator_type_invalid_type() {
        let result = validate_operator_type(String::from("SECRET_AGENT_007"));
        assert!(result.is_err());
    }
}
