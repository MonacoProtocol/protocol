#![allow(dead_code)]

pub const DISCRIMINATOR_SIZE: usize = 8;
pub const BOOL_SIZE: usize = 1;
pub const ENUM_SIZE: usize = 1; // for data/field-less enums
pub const I64_SIZE: usize = 8;
pub const I128_SIZE: usize = 16;
pub const U8_SIZE: usize = 1;
pub const U16_SIZE: usize = 2;
pub const U64_SIZE: usize = 8;
pub const U32_SIZE: usize = 4;
pub const F32_SIZE: usize = 4;
pub const F64_SIZE: usize = 8;
pub const PUB_KEY_SIZE: usize = 32;
pub const CHAR_SIZE: usize = 4;

const OPTION_PREFIX_SIZE: usize = 1;
pub const fn option_size(element_size: usize) -> usize {
    OPTION_PREFIX_SIZE + element_size
}

const VEC_PREFIX_SIZE: usize = 4;
pub const fn vec_size(element_size: usize, length: usize) -> usize {
    VEC_PREFIX_SIZE + element_size * length
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_option_size() {
        assert_eq!(1, option_size(0_usize));
        assert_eq!(2, option_size(1_usize));
        assert_eq!(3, option_size(2_usize));
        assert_eq!(4, option_size(3_usize));
    }

    #[test]
    fn test_vec_size() {
        assert_eq!(4, vec_size(0_usize, 0_usize));
        assert_eq!(4, vec_size(1_usize, 0_usize));
        assert_eq!(4, vec_size(2_usize, 0_usize));
        assert_eq!(4, vec_size(3_usize, 0_usize));
        assert_eq!(4, vec_size(0_usize, 1_usize));
        assert_eq!(5, vec_size(1_usize, 1_usize));
        assert_eq!(6, vec_size(2_usize, 1_usize));
        assert_eq!(7, vec_size(3_usize, 1_usize));
        assert_eq!(4, vec_size(0_usize, 2_usize));
        assert_eq!(6, vec_size(1_usize, 2_usize));
        assert_eq!(8, vec_size(2_usize, 2_usize));
        assert_eq!(10, vec_size(3_usize, 2_usize));
    }
}
