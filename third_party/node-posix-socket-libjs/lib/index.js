/* global BigInt */

/* eslint-disable complexity */
/* eslint-disable no-underscore-dangle */

import sys from "../../node-syscall-napi/lib/index.js";
import structures from "./structures.js";
import pollerFactory from "./poll.js";
//
// const asyscall = (...params) => {
//   const lastParam = params[params.length - 1];
//   if (typeof lastParam !== "function") {
//     throw new Error("callback required");
//   }
//   const callback = lastParam;
//
//   const actualParams = params.slice(0, params.length - 1);
//   const processedParams = actualParams.map((param) => {
//     if (typeof param === "number") {
//       return BigInt(param);
//     } else if (Buffer.isBuffer(param)) {
//       return param;
//     } else {
//       throw new Error(`unsupported param type "${typeof param}"`);
//     }
//   });
//
//   sys.syscall(...processedParams).then((res) => {
//     callback(null, Number(res));
//   }, (err) => {
//     callback(err);
//   });
// };
//
// console.log("defining global.libsys");
// global.libsys = {
//   asyscall
// };
//
// const withLibjs = async (fn) => {
//   const libjs = await import("libjs");
//   return await fn({ libjs });
// };
//
// const socket = async ({ domain, type, protocol }) => {
//   const fd = await withLibjs(({ libjs }) => {
//     return new Promise((resolve, reject) => {
//       libjs.socketAsync(domain, type, protocol, (err, res) => {
//         if (err) {
//           reject(err);
//         } else {
//           resolve(res);
//         }
//       });
//     });
//   });
//   // const fd = await libjs.socketAsync(domain, type, protocol);
//
//   const close = async () => {
//     // await libjs.closeAsync(fd);
//   };
//
//   return {
//     fd,
//     close
//   };
// };

const fromFd = async ({ fd }) => {
  const bind = async ({ sockaddr }) => {
    await sys.syscall(sys.__NR_bind, fd, sockaddr, BigInt(sockaddr.length));
  };

  const getsockname = async () => {
    const buf = Buffer.alloc(64);
    const sizeBuf = Buffer.alloc(8);
    sizeBuf.writeUInt32LE(buf.length, 0);
    await sys.syscall(sys.__NR_getsockname, fd, buf, sizeBuf);

    const actualSize = sizeBuf.readUInt32LE(0);
    return buf.slice(0, actualSize);
  };

  const sendmsg = async ({ data, msghdr, flags }) => {
    const msg_iov = structures.iovec.format({
      "iov_base": data,
      "iov_len": BigInt(data.length)
    });

    const msg_name = msghdr.msg_name || Buffer.alloc(0);
    const msg_control = msghdr.msg_control || Buffer.alloc(0);

    const hdrAsBuffer = structures.msghdr.format({
      msg_name,
      "msg_namelen": BigInt(msg_name.length),
      msg_iov,
      "msg_iovlen": BigInt(1),
      msg_control,
      "msg_controllen": BigInt(msg_control.length),
      "msg_flags": msghdr.msg_flags || 0n
    });

    return await sys.syscall(sys.__NR_sendmsg, fd, hdrAsBuffer, BigInt(flags || 0));
  };

  const recvmsg = async ({ data, msghdr = {}, flags }) => {
    const msg_name = msghdr.msg_name || Buffer.alloc(0);
    const msg_control = msghdr.msg_control || Buffer.alloc(0);

    const msg_iov = structures.iovec.format({
      "iov_base": data,
      "iov_len": BigInt(data.length)
    });

    const hdrAsBuffer = structures.msghdr.format({
      msg_name,
      "msg_namelen": BigInt(msg_name.length),
      msg_iov,
      "msg_iovlen": BigInt(1),
      msg_control,
      "msg_controllen": BigInt(msg_control.length)
    });

    const bytesReceived = await sys.syscall(sys.__NR_recvmsg, fd, hdrAsBuffer, BigInt(flags || 0));

    const hdr = structures.msghdr.parse(hdrAsBuffer);

    return {
      data,
      "bytesReceived": Number(bytesReceived),
      "msghdr": hdr
    };
  };

  const poller = await pollerFactory.create({ fd, recvmsg });

  const close = async () => {
    await poller.close();
    await sys.syscall(sys.__NR_close, fd);
  };

  return {
    bind,
    getsockname,

    sendmsg,
    // recvmsg,

    close,
    "on": poller.on
  };
};

const create = async ({ domain, type, protocol }) => {
  const fd = await sys.syscall(sys.__NR_socket, BigInt(domain), BigInt(type), BigInt(protocol));
  return await fromFd({ fd });
};

export default {
  create
};
