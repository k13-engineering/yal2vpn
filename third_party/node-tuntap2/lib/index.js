/* eslint-disable max-statements */
/* eslint-disable complexity */
/* eslint-disable prefer-destructuring */

import fs from "fs";
import ioctl from "ioctl";
// import util from "util";

import structures from "./structures.js";
import rtnetlink from "node-rtnetlink";

import EventEmitter from "events";

const TUNSETIFF = 0x400454CA;
const TUNGETIFF = 0x800454d2;

const IFF_TUN = 0x0001;
const IFF_TAP = 0x0002;
const IFF_NO_PI = 0x1000;

/*
 * IMPORTANT: fs.promises API can not be used in this case (as per Node.js v15).
 * Using fs.promises behaves differently than fs.* functions.
 * FileHandle.close() waits for previously started FileHandle.read() to finish,
 * which is not what we want when trying to close a device. In this case read()
 * will block until a packet is arriving which in practice almost always happens
 * but in theory might not. Also it would causes noticable delay when closing.
 */
// const open = async (...openParams) => {
//   const openFd = util.promisify(fs.open);
//   const readFd = util.promisify(fs.read);
//   const writeFd = util.promisify(fs.write);
//   const closeFd = util.promisify(fs.close);
//
//   const fd = await openFd(...openParams);
//
//   const read = (...params) => {
//     return readFd(fd, ...params);
//   };
//
//   const write = (...params) => {
//     return writeFd(fd, ...params);
//   };
//
//   const close = () => {
//     return closeFd(fd);
//   };
//
//   return {
//     fd,
//     read,
//     write,
//     close
//   };
// };

const setup = ({ fd, name, flags }) => {
  const ifr = structures.ifreq_flags.allocate();
  ifr.set("ifr_name", name);
  ifr.set("ifr_flags", flags);

  const buf = ifr.buffer();

  ioctl(fd, TUNSETIFF, buf);

  // const resultBuffer = Buffer.alloc(structures.ifreq.length());
  // ioctl(fh.fd, TUNGETIFF, resultBuffer);
  ioctl(fd, TUNGETIFF, buf);

  const actualName = ifr.get("ifr_name");

  return {
    actualName
  };
};

const create = async ({ type, name = "" }) => {
  const emitter = new EventEmitter();
  let closed = false;
  let ifindex;

  const fh = await fs.promises.open("/dev/net/tun", "r+");

  const close = async () => {
    const rt = await rtnetlink.open();
    try {
      // Ideally we would want to close the file descriptor and would expect
      // a short read or some sort of error code in the read() call.
      // Unfortunately if we start a read() on the fd the kernel will keep
      // the device alive until the call returns. If there is no traffic,
      // this could theoretically never be the case.
      // A hacky, yet practical solution is delete the interface, which
      // casues the read() to fail with EFAULT.

      closed = true;
      await rt.link.fromIndex({ ifindex }).deleteLink();

      console.log("init fd close!");
      await fh.close();
      console.log("tap device closed!");
    } finally {
      await rt.close();
    }
  };

  try {
    const flags = (type === "tun" ? IFF_TUN : IFF_TAP) | IFF_NO_PI;

    const { actualName } = setup({ "fd": fh.fd, name, flags });


    const rt = await rtnetlink.open();
    try {
      // TODO: find a better way to find ifindex as this is racy.
      // Ideally there should be a syscall to retrieve the interface index
      // of the created TAP device, but we only have the possibility to get the
      // interface name.
      // The interface could have been renamed since it's creation results
      // in either a error in lookup or worse may give us the wrong interface

      const link = await rt.link.findOneBy({ "name": actualName });
      ifindex = link.ifindex;
      await link.modify({
        "flags": {
          "IFF_UP": true
        }
      });
    } finally {
      await rt.close();
    }

    const readBuffer = Buffer.alloc(2000);

    const readNext = async () => {
      if (closed) {
        return;
      }

      try {
        const { bytesRead } = await fh.read(readBuffer, 0, readBuffer.length);

        // console.log("bytesRead =", bytesRead);
        if (bytesRead === 0) {
          if (!closed) {
            throw new Error("short read from device");
          }

          return;
        }

        // console.log("bytesRead =", bytesRead);

        const buffer = Buffer.alloc(bytesRead);
        readBuffer.copy(buffer, 0, 0, buffer.length);
        emitter.emit("packet", buffer);

        process.nextTick(readNext);
      } catch (ex) {
        if (ex.code === "EFAULT" && closed) {
          // When we delete the network device during read, we get an EFAULT
          // error. In the case that we closed the device, EFAULT can happen
          // and is therefore not to be treadted as an error.

          console.log("read returned EFAULT, expected...");

          return;
        }

        console.error(ex);
        emitter.emit("error", ex);
      }
    };
    readNext();

    let sendQueue = [];
    let sendInProgress = false;

    const doSend = async (packet) => {
      const { bytesWritten } = await fh.write(packet);
      // console.log("bytesWritten =", bytesWritten);

      if (bytesWritten !== packet.length) {
        throw new Error("short write to device");
      }
    };

    const maybeSendNext = async () => {
      if (sendQueue.length === 0 || sendInProgress) {
        return;
      }

      sendInProgress = true;

      const [ job, ...remaining ] = sendQueue;
      sendQueue = remaining;

      doSend(job.packet)
        .then(job.resolve, job.reject)
        .finally(() => {
          sendInProgress = false;
          maybeSendNext();
        });
    };

    const send = async (packet) => {
      return new Promise((resolve, reject) => {
        sendQueue = [...sendQueue, {
          resolve,
          reject,
          packet
        }];
        maybeSendNext();
      });
    };

    return {
      ifindex,
      "name": actualName,
      "on": emitter.on.bind(emitter),
      send,
      close
    };
  } catch (ex) {
    await fh.close();
    throw ex;
  }
};

export default {
  create
};
