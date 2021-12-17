import EventEmitter from "events";
import struct from "../../node-ya-struct/lib/index.js";
import sys from "../../node-syscall-napi/lib/index.js";

const EPOLL_CLOEXEC = 0x80000n;
const EPOLL_CTL_ADD = 0x01n;
const EPOLLIN = 0x001n;

/* eslint-disable no-underscore-dangle */

const epoll_event = struct.define(({ field }) => {
  field.UInt32("events");
  field.UInt32("_pad1");
  field.Pointer("data_ptr");
  field.Int32("data_fd");
  field.UInt32("data_u32");
  field.UInt64("data_u64");
}).forHost();

const MSG_PEEK = 0x02n;
const MSG_TRUNC = 0x20n;

const create = async ({ fd, recvmsg }) => {
  const emitter = new EventEmitter();

  let closeCallback = null;
  let died = false;

  const efd = await sys.syscall(sys.__NR_epoll_create1, BigInt(EPOLL_CLOEXEC));

  const ev = epoll_event.format({
    "events": EPOLLIN
  });
  await sys.syscall(sys.__NR_epoll_ctl, efd, BigInt(EPOLL_CTL_ADD), fd, ev);

  const next = async () => {
    try {
      const numReady = await sys.syscall(sys.__NR_epoll_pwait, efd, ev, BigInt(1), BigInt(100), BigInt(0));

      if (closeCallback) {
        closeCallback();
        return;
      }

      if (numReady > 0) {
        const { "bytesReceived": availableBytes } = await recvmsg({
          "data": Buffer.alloc(0),
          "flags": MSG_PEEK | MSG_TRUNC
        });

        const { data, bytesReceived } = await recvmsg({
          "data": Buffer.alloc(availableBytes),
          "msghdr": {
            "msg_name": Buffer.alloc(64)
          }
        });

        const message = data.slice(0, bytesReceived);

        emitter.emit("message", message);
      }

      next();
    } catch (ex) {
      console.error(ex);
      died = true;
    }
  };
  next();

  const close = async () => {
    if (!died) {
      await new Promise((resolve) => {
        closeCallback = resolve;
      });
    }

    await sys.syscall(sys.__NR_close, efd);
  };

  return {
    close,
    "on": emitter.on.bind(emitter)
  };
};

export default {
  create
};
