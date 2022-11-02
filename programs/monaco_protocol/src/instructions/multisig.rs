use crate::state::multisig::{InstructionAccount, MultisigTransaction};
use crate::{CoreError, MultisigGroup};
use anchor_lang::prelude::*;
use solana_program::instruction::Instruction;

// create multisig configuration account
pub fn create_multisig(
    multisig_group: &mut MultisigGroup,
    group_title: String,
    members: Vec<Pubkey>,
    approval_threshold: u64,
) -> Result<()> {
    MultisigGroup::verify_unique_members(&members)?;
    require!(!members.is_empty(), CoreError::InvalidMembersLen);
    require!(
        approval_threshold > 0 && approval_threshold <= members.len() as u64,
        CoreError::InvalidApprovalThreshold
    );
    require!(
        (1..=50).contains(&group_title.len()),
        CoreError::MultisigGroupTitleLen
    );
    multisig_group.members = members;
    multisig_group.approval_threshold = approval_threshold;
    multisig_group.members_version = 0;
    multisig_group.group_title = group_title;
    Ok(())
}

pub fn create_multisig_transaction(
    multisig_group: &MultisigGroup,
    multisig_key: &Pubkey,
    multisig_member_key: &Pubkey,
    transaction: &mut MultisigTransaction,
    instruction_accounts: Vec<InstructionAccount>,
    instruction_data: Vec<u8>,
) -> Result<()> {
    let member_index = multisig_group
        .members
        .iter()
        .position(|key| key == multisig_member_key)
        .ok_or(CoreError::SignerNotFound)?;

    let mut member_approvals = vec![false; multisig_group.members.len()];
    member_approvals[member_index] = true;

    transaction.instruction_accounts = instruction_accounts;
    transaction.instruction_data = instruction_data;
    transaction.multisig_approvals = member_approvals;
    transaction.multisig_group = *multisig_key;
    transaction.executed = false;
    transaction.members_version = multisig_group.members_version;

    Ok(())
}

pub fn set_multisig_members(
    new_members: Vec<Pubkey>,
    multisig_group: &mut MultisigGroup,
) -> Result<()> {
    MultisigGroup::verify_unique_members(&new_members)?;
    require!(!new_members.is_empty(), CoreError::InvalidMembersLen);

    if (new_members.len() as u64) < multisig_group.approval_threshold {
        multisig_group.approval_threshold = new_members.len() as u64;
    }

    multisig_group.members = new_members;
    multisig_group.members_version += 1;

    Ok(())
}

pub fn approve_multisig_transaction(
    signer: &Pubkey,
    multisig_members: &[Pubkey],
    transaction: &mut MultisigTransaction,
) -> Result<()> {
    let signer_index = multisig_members
        .iter()
        .position(|key| key == signer)
        .ok_or(CoreError::SignerNotFound)?;

    transaction.multisig_approvals[signer_index] = true;

    Ok(())
}

pub fn execute_multisig_transaction(
    transaction: &mut MultisigTransaction,
    signer_key: &Pubkey,
    signer_bump: u8,
    multisig_group: &MultisigGroup,
    multisig_group_key: &Pubkey,
    remaining_accounts: &[AccountInfo],
) -> Result<()> {
    require!(!transaction.executed, CoreError::TransactionHasExecuted);

    // ensure approval threshold has been met
    let approval_count = transaction
        .multisig_approvals
        .iter()
        .filter(|&approved| *approved)
        .count() as u64;
    require!(
        approval_count >= multisig_group.approval_threshold,
        CoreError::ApprovalThresholdNotMet
    );

    // convert transaction into executable instruction
    let mut instruction: Instruction = transaction.into();
    instruction.accounts = instruction
        .accounts
        .iter()
        .map(|acc| {
            let mut acc = acc.clone();
            if &acc.pubkey == signer_key {
                msg!(&format!("{:?}", &signer_key));
                acc.is_signer = true;
            }
            acc
        })
        .collect();

    // build seeds and send transaction
    solana_program::program::invoke_signed(
        &instruction,
        remaining_accounts,
        &[&[multisig_group_key.as_ref(), &[signer_bump]]],
    )?;

    transaction.executed = true;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ok_response() {
        let mut empty_multisig_account = MultisigGroup {
            members: vec![],
            approval_threshold: 0,
            members_version: 0,
            group_title: "".to_string(),
        };
        let result = create_multisig(
            &mut empty_multisig_account,
            "MONACO_MULTISIG".to_string(),
            vec![Pubkey::new_unique(), Pubkey::new_unique()],
            1,
        );
        assert!(result.is_ok())
    }

    #[test]
    fn test_invalid_approval_threshold() {
        let mut empty_multisig_account = MultisigGroup {
            members: vec![],
            approval_threshold: 0,
            members_version: 0,
            group_title: "".to_string(),
        };
        let result = create_multisig(
            &mut empty_multisig_account,
            "MONACO_MULTISIG".to_string(),
            vec![Pubkey::new_unique(), Pubkey::new_unique()],
            6,
        );
        let expected_error = Err(error!(CoreError::InvalidApprovalThreshold));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_empty_members() {
        let mut empty_multisig_account = MultisigGroup {
            members: vec![],
            approval_threshold: 0,
            members_version: 0,
            group_title: "".to_string(),
        };
        let result = create_multisig(
            &mut empty_multisig_account,
            "MONACO_MULTISIG".to_string(),
            vec![],
            1,
        );
        let expected_error = Err(error!(CoreError::InvalidMembersLen));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_title_length_validation() {
        let mut empty_multisig_account = MultisigGroup {
            members: vec![],
            approval_threshold: 0,
            members_version: 0,
            group_title: "".to_string(),
        };
        let result = create_multisig(
            &mut empty_multisig_account,
            "123456789012345678901234567890123456789012345678901".to_string(),
            vec![Pubkey::new_unique()],
            1,
        );
        let expected_error = Err(error!(CoreError::MultisigGroupTitleLen));
        assert_eq!(expected_error, result);

        let result = create_multisig(
            &mut empty_multisig_account,
            "".to_string(),
            vec![Pubkey::new_unique()],
            1,
        );
        let expected_error = Err(error!(CoreError::MultisigGroupTitleLen));
        assert_eq!(expected_error, result);
    }

    // set_multisig_members

    #[test]
    fn test_set_multisig_members_ok_response() {
        let member1 = Pubkey::new_unique();
        let member2 = Pubkey::new_unique();
        let member3 = Pubkey::new_unique();

        let mut multisig_group = MultisigGroup {
            members: vec![member1, member2],
            approval_threshold: 1,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let result = set_multisig_members(vec![member1, member2, member3], &mut multisig_group);
        assert!(result.is_ok());
        assert_eq!(multisig_group.members, vec![member1, member2, member3])
    }

    #[test]
    fn test_set_multisig_members_ok_response_approval_threshold_adjusted() {
        let member1 = Pubkey::new_unique();
        let member2 = Pubkey::new_unique();
        let member3 = Pubkey::new_unique();

        let mut multisig_group = MultisigGroup {
            members: vec![member1, member2, member3],
            approval_threshold: 3,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let result = set_multisig_members(vec![member1, member2], &mut multisig_group);
        assert!(result.is_ok());
        assert_eq!(multisig_group.approval_threshold, 2);
        assert_eq!(multisig_group.members, vec![member1, member2]);
        assert_eq!(multisig_group.members_version, 1)
    }

    // create_multisig_transaction

    #[test]
    fn test_create_transaction_ok_response() {
        let member1 = Pubkey::new_unique();
        let member2 = Pubkey::new_unique();
        let member3 = Pubkey::new_unique();

        let multisig_group = MultisigGroup {
            members: vec![member1, member2, member3],
            approval_threshold: 3,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let multisig_key = Pubkey::new_unique();

        let mut new_transaction = MultisigTransaction {
            multisig_group: multisig_key,
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![],
            executed: false,
            members_version: 0,
        };

        let ix_account_1 = InstructionAccount {
            pubkey: Default::default(),
            is_signer: false,
            is_writable: false,
        };
        let ix_account_2 = InstructionAccount {
            pubkey: Default::default(),
            is_signer: false,
            is_writable: false,
        };

        let result = create_multisig_transaction(
            &multisig_group,
            &multisig_key,
            &member2,
            &mut new_transaction,
            vec![ix_account_1, ix_account_2],
            vec![1, 2, 3, 4, 5],
        );
        assert!(result.is_ok());
        // member2 has approved
        assert_eq!(new_transaction.multisig_approvals, vec![false, true, false]);
        assert_eq!(new_transaction.instruction_data, vec![1, 2, 3, 4, 5]);
        assert_eq!(
            new_transaction.members_version,
            multisig_group.members_version
        );
    }

    #[test]
    fn test_create_transaction_signer_not_found() {
        let member1 = Pubkey::new_unique();
        let member2 = Pubkey::new_unique();
        let member3 = Pubkey::new_unique();

        let multisig_group = MultisigGroup {
            members: vec![member1, member2],
            approval_threshold: 3,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let multisig_key = Pubkey::new_unique();

        let mut new_transaction = MultisigTransaction {
            multisig_group: multisig_key,
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![],
            executed: false,
            members_version: 0,
        };

        let ix_account_1 = InstructionAccount {
            pubkey: Default::default(),
            is_signer: false,
            is_writable: false,
        };
        let ix_account_2 = InstructionAccount {
            pubkey: Default::default(),
            is_signer: false,
            is_writable: false,
        };

        let result = create_multisig_transaction(
            &multisig_group,
            &multisig_key,
            &member3,
            &mut new_transaction,
            vec![ix_account_1, ix_account_2],
            vec![1, 2, 3, 4, 5],
        );
        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::SignerNotFound));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_approve_multisig_transaction_ok_result() {
        let member1 = Pubkey::new_unique();
        let member2 = Pubkey::new_unique();
        let signer = Pubkey::new_unique();
        let multisig_members = vec![member1, member2, signer];

        let mut transaction = MultisigTransaction {
            multisig_group: Pubkey::new_unique(),
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![true, false, false],
            executed: false,
            members_version: 0,
        };

        let result = approve_multisig_transaction(&signer, &multisig_members, &mut transaction);
        assert!(result.is_ok());
        assert_eq!(transaction.multisig_approvals, vec![true, false, true])
    }

    #[test]
    fn test_approve_multisig_transaction_signer_not_found() {
        let member1 = Pubkey::new_unique();
        let member2 = Pubkey::new_unique();
        let member3 = Pubkey::new_unique();
        let multisig_members = vec![member1, member2, member3];

        let signer = Pubkey::new_unique();

        let mut transaction = MultisigTransaction {
            multisig_group: Pubkey::new_unique(),
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![true, false, false],
            executed: false,
            members_version: 0,
        };

        let result = approve_multisig_transaction(&signer, &multisig_members, &mut transaction);
        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::SignerNotFound));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_execute_transaction_ok_result() {
        let signer = Pubkey::new_unique();
        let multisig_members = vec![Pubkey::new_unique(), Pubkey::new_unique(), signer];

        let multisig_group = MultisigGroup {
            members: multisig_members,
            approval_threshold: 1,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let multisig_key = Pubkey::new_unique();

        let mut transaction = MultisigTransaction {
            multisig_group: Pubkey::new_unique(),
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![true, false, false],
            executed: false,
            members_version: 0,
        };

        let result = execute_multisig_transaction(
            &mut transaction,
            &signer,
            255,
            &multisig_group,
            &multisig_key,
            &vec![],
        );

        assert!(result.is_ok())
    }

    #[test]
    fn test_execute_transaction_already_executed() {
        let signer = Pubkey::new_unique();
        let multisig_members = vec![Pubkey::new_unique(), Pubkey::new_unique(), signer];

        let multisig_group = MultisigGroup {
            members: multisig_members,
            approval_threshold: 1,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let multisig_key = Pubkey::new_unique();

        let mut transaction = MultisigTransaction {
            multisig_group: Pubkey::new_unique(),
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![true, false, false],
            executed: true,
            members_version: 0,
        };

        let result = execute_multisig_transaction(
            &mut transaction,
            &signer,
            255,
            &multisig_group,
            &multisig_key,
            &vec![],
        );

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::TransactionHasExecuted));
        assert_eq!(expected_error, result);
    }

    #[test]
    fn test_execute_transaction_approval_threshold_not_met() {
        let signer = Pubkey::new_unique();
        let multisig_members = vec![Pubkey::new_unique(), Pubkey::new_unique(), signer];

        let multisig_group = MultisigGroup {
            members: multisig_members,
            approval_threshold: 3,
            members_version: 0,
            group_title: "TEST_GROUP".to_string(),
        };
        let multisig_key = Pubkey::new_unique();

        let mut transaction = MultisigTransaction {
            multisig_group: Pubkey::new_unique(),
            instruction_accounts: vec![],
            instruction_data: vec![],
            multisig_approvals: vec![true, false, false],
            executed: false,
            members_version: 0,
        };

        let result = execute_multisig_transaction(
            &mut transaction,
            &signer,
            255,
            &multisig_group,
            &multisig_key,
            &vec![],
        );

        assert!(result.is_err());
        let expected_error = Err(error!(CoreError::ApprovalThresholdNotMet));
        assert_eq!(expected_error, result);
    }
}
