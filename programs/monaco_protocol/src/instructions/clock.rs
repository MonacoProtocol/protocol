pub fn current_timestamp() -> i64 {
    #[cfg(not(test))]
    {
        use solana_program::clock::Clock;
        use solana_program::sysvar::Sysvar;
        Clock::get().unwrap().unix_timestamp
    }
    #[cfg(test)]
    {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64
    }
}
