import rtnetlink from "../node-rtnetlink/index.js";

const createOrHijack = ({ bridgeName }) => {
  return rtnetlink.open().then((rt) => {
    return rt.link
      .tryFindOneBy({ name: bridgeName })
      .then((existingInterface) => {
        if (existingInterface) {
          console.warn(`using existing bridge ${bridgeName}`);
          return existingInterface;
        } else {
          return rt.link
            .createLink({
              linkinfo: {
                kind: "bridge",
              },
            })
            .then((bridgeLink) => {
              return bridgeLink.modify({ name: bridgeName }).then(() => {
                return bridgeLink;
              });
            });
        }
      })
      .then((bridgeLink) => {
        return bridgeLink
          .modify({
            flags: {
              IFF_UP: true,
            },
          })
          .then(() => {
            const connect = ({ ifindex }) => {
              const devLink = rt.link.fromIndex({ ifindex });

              return devLink.modify({
                masterIndex: bridgeLink.ifindex,
              });
            };

            return {
              connect,
              deleteLink: bridgeLink.deleteLink
            };
          });
      });
  });
};

export default {
  createOrHijack,
};
