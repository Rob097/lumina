import { describe, expect, it } from 'vitest';
import { fetchRemoteImage, isBlockedIp } from '../src/lib/net/safe-fetch';

describe('isBlockedIp (SSRF guard)', () => {
  it('blocks private, loopback, link-local, metadata, CGNAT, multicast + invalid', () => {
    for (const ip of [
      '0.0.0.0',
      '127.0.0.1',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // AWS/GCP IMDS
      '100.64.0.1', // CGNAT
      '224.0.0.1', // multicast
      '::1',
      'fe80::1',
      'fc00::1',
      'fd12:3456::1',
      '::ffff:127.0.0.1', // IPv4-mapped loopback
      'not-an-ip',
      '',
    ]) {
      expect(isBlockedIp(ip)).toBe(true);
    }
  });

  it('allows public unicast addresses', () => {
    for (const ip of [
      '8.8.8.8',
      '1.1.1.1',
      '172.15.0.1', // just below 172.16/12
      '172.32.0.1', // just above 172.16/12
      '192.167.0.1',
      '100.63.0.1', // just below CGNAT
      '100.128.0.1', // just above CGNAT
      '2606:4700:4700::1111', // public IPv6
    ]) {
      expect(isBlockedIp(ip)).toBe(false);
    }
  });
});

describe('fetchRemoteImage (no network — rejects before fetching)', () => {
  it('rejects a non-https scheme', async () => {
    expect(await fetchRemoteImage('http://example.com/x.png')).toBeNull();
    expect(await fetchRemoteImage('file:///etc/passwd')).toBeNull();
    expect(await fetchRemoteImage('ftp://example.com/x.png')).toBeNull();
  });

  it('rejects a blocked IP literal host without making a request', async () => {
    expect(await fetchRemoteImage('https://169.254.169.254/latest/meta-data/')).toBeNull();
    expect(await fetchRemoteImage('https://127.0.0.1/x.png')).toBeNull();
    expect(await fetchRemoteImage('https://[::1]/x.png')).toBeNull();
  });

  it('rejects an unparseable URL', async () => {
    expect(await fetchRemoteImage('not a url')).toBeNull();
  });
});
