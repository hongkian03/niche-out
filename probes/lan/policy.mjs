import { BlockList, isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";

export function selectedInterface(preferred = process.env.PROBE_LAN_IP) {
  const privateRanges = new BlockList();
  privateRanges.addSubnet("10.0.0.0", 8);
  privateRanges.addSubnet("172.16.0.0", 12);
  privateRanges.addSubnet("192.168.0.0", 16);
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    addresses.filter(address => address.family === "IPv4" && !address.internal &&
      privateRanges.check(address.address) && address.cidr &&
      (preferred ? address.address === preferred : !/^(utun|tun|tap|wg|docker|veth|virbr|bridge|vmnet|tailscale)/i.test(name)))
      .map(address => ({ ...address, name })));
  if (candidates.length !== 1) throw new Error("Select one trusted LAN interface explicitly with PROBE_LAN_IP.");
  return candidates[0];
}

export function makePeerCheck({ address, cidr }) {
  const allowed = new BlockList();
  allowed.addSubnet(address, Number(cidr.split("/")[1]));
  return peer => isIPv4(peer ?? "") && allowed.check(peer);
}

export function allowedRequest({ host, origin, method, peer }, expectedOrigin, peerCheck) {
  if (!peerCheck(peer) || host !== new URL(expectedOrigin).host) return false;
  if (origin !== undefined) return origin === expectedOrigin;
  return method === "GET" || method === "HEAD";
}
