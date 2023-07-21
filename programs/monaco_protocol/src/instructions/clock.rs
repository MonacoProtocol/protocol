use solana_program::clock::UnixTimestamp;

pub fn current_timestamp() -> UnixTimestamp {
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
            .as_secs()
            .min(UnixTimestamp::MAX as u64) as UnixTimestamp
    }
}
