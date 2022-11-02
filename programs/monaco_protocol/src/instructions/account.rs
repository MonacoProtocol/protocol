use anchor_lang::__private::CLOSED_ACCOUNT_DISCRIMINATOR;
use anchor_lang::prelude::*;
use std::io::{Cursor, Write};
use std::ops::DerefMut;

pub fn close_account(
    to_close: &mut AccountInfo,
    lamport_destination: &mut AccountInfo,
) -> Result<()> {
    let dest_starting_lamports = lamport_destination.lamports();

    **lamport_destination.lamports.borrow_mut() = dest_starting_lamports
        .checked_add(to_close.lamports())
        .unwrap();
    **to_close.lamports.borrow_mut() = 0;

    let mut data = to_close.try_borrow_mut_data()?;
    for byte in data.deref_mut().iter_mut() {
        *byte = 0;
    }

    let dst: &mut [u8] = &mut data;
    let mut cursor = Cursor::new(dst);
    cursor.write_all(&CLOSED_ACCOUNT_DISCRIMINATOR).unwrap();

    Ok(())
}
