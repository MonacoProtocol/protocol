use crate::state::type_size::{
    vec_size, BOOL_SIZE, CHAR_SIZE, DISCRIMINATOR_SIZE, PUB_KEY_SIZE, U32_SIZE, U64_SIZE, U8_SIZE,
};
use crate::CoreError;
use anchor_lang::prelude::*;
use solana_program::instruction::Instruction;
use solana_program::pubkey::Pubkey;
use std::collections::HashSet;

#[account]
pub struct MultisigGroup {
    pub members: Vec<Pubkey>,
    pub approval_threshold: u64,
    pub members_version: u32,
    pub group_title: String,
}

impl MultisigGroup {
    pub const MAX_MEMBERS: usize = 10;
    pub const GROUP_TITLE_MAX_LENGTH: usize = 50;
    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        vec_size (PUB_KEY_SIZE, MultisigGroup::MAX_MEMBERS) + // members
        U64_SIZE +
        U32_SIZE +  // members_version
        vec_size (CHAR_SIZE, MultisigGroup::GROUP_TITLE_MAX_LENGTH); // group_title

    pub fn verify_unique_members(members: &[Pubkey]) -> Result<()> {
        let mut set: HashSet<Pubkey> = HashSet::with_capacity(members.len());
        for member in members {
            require!(set.insert(*member), CoreError::UniqueMembers)
        }
        Ok(())
    }
}

#[account]
pub struct MultisigTransaction {
    pub multisig_group: Pubkey,
    pub instruction_accounts: Vec<InstructionAccount>,
    pub instruction_data: Vec<u8>,
    pub multisig_approvals: Vec<bool>,
    pub executed: bool,
    pub members_version: u32,
}

impl MultisigTransaction {
    pub const MAX_ACCOUNTS: usize = 20;
    pub const MAX_INSTRUCTION_DATA: usize = 200;

    pub const SIZE: usize = DISCRIMINATOR_SIZE +
        PUB_KEY_SIZE + // multisig
        vec_size (InstructionAccount::SIZE, MultisigTransaction::MAX_ACCOUNTS) + // instruction_accounts
        vec_size(U8_SIZE, MultisigTransaction::MAX_INSTRUCTION_DATA) + // instruction_data
        vec_size(BOOL_SIZE, MultisigGroup::MAX_MEMBERS) + // multisig_approvals
        BOOL_SIZE +  // executed
        U32_SIZE; // members_version
}

impl From<&mut MultisigTransaction> for Instruction {
    fn from(tx: &mut MultisigTransaction) -> Instruction {
        Instruction {
            program_id: crate::id(),
            accounts: tx.instruction_accounts.iter().map(Into::into).collect(),
            data: tx.instruction_data.clone(),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InstructionAccount {
    pub pubkey: Pubkey,
    pub is_signer: bool,
    pub is_writable: bool,
}

impl InstructionAccount {
    pub const SIZE: usize = PUB_KEY_SIZE +  // pubkey
        (BOOL_SIZE * 2); // is_signer & is_writable
}

impl From<&InstructionAccount> for AccountMeta {
    fn from(account: &InstructionAccount) -> AccountMeta {
        match account.is_writable {
            false => AccountMeta::new_readonly(account.pubkey, account.is_signer),
            true => AccountMeta::new(account.pubkey, account.is_signer),
        }
    }
}

impl From<&AccountMeta> for InstructionAccount {
    fn from(account_meta: &AccountMeta) -> InstructionAccount {
        InstructionAccount {
            pubkey: account_meta.pubkey,
            is_signer: account_meta.is_signer,
            is_writable: account_meta.is_writable,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ok_response() {
        let result =
            MultisigGroup::verify_unique_members(&vec![Pubkey::new_unique(), Pubkey::new_unique()]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_duplicate_members_error() {
        let duplicate = Pubkey::new_unique();
        let result = MultisigGroup::verify_unique_members(&vec![
            duplicate,
            duplicate,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
        ]);
        let expected_error = Err(error!(CoreError::UniqueMembers));
        assert_eq!(expected_error, result);

        let result = MultisigGroup::verify_unique_members(&vec![
            duplicate,
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            duplicate,
        ]);
        let expected_error = Err(error!(CoreError::UniqueMembers));
        assert_eq!(expected_error, result);
    }
}
