// import Struct from "struct";
//
// const msghdr = Struct()
//   .word64Ule("msg_name")
//   .word32Ule("msg_namelen")
//   .word32Ule("_pad1")
//   .word64Ule("msg_iov")
//   .word64Ule("msg_iovlen")
//   .word64Ule("msg_control")
//   .word64Ule("msg_controllen")
//   .word32Ule("msg_flags");
//
// const iovec = Struct()
//   .word64Ule("iov_base")
//   .word64Ule("iov_len");

import struct from "../../node-ya-struct/lib/index.js";

const msghdr = struct.define(({ field }) => {
  field.Pointer("msg_name");
  field.Pointer("msg_namelen");
  field.Pointer("msg_iov");
  field.Pointer("msg_iovlen");
  field.Pointer("msg_control");
  field.Pointer("msg_controllen");
  field.UInt32("msg_flags");
}).forHost();

const iovec = struct.define(({ field }) => {
  field.Pointer("iov_base");
  field.Pointer("iov_len");
}).forHost();

export default {
  msghdr,
  iovec
};
