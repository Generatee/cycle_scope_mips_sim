// Sparse, byte-addressable, little-endian memory (4 KB pages).
const PAGE = 4096

export class Memory {
  pages = new Map<number, Uint8Array>()

  private page(addr: number, create: boolean): Uint8Array | undefined {
    const n = Math.floor((addr >>> 0) / PAGE)
    let p = this.pages.get(n)
    if (!p && create) {
      p = new Uint8Array(PAGE)
      this.pages.set(n, p)
    }
    return p
  }

  readByte(addr: number): number {
    const p = this.page(addr, false)
    return p ? p[(addr >>> 0) % PAGE] : 0
  }

  writeByte(addr: number, v: number) {
    this.page(addr, true)![(addr >>> 0) % PAGE] = v & 255
  }

  readWord(addr: number): number {
    addr >>>= 0
    return (
      (this.readByte(addr) |
        (this.readByte(addr + 1) << 8) |
        (this.readByte(addr + 2) << 16) |
        (this.readByte(addr + 3) << 24)) >>>
      0
    )
  }

  writeWord(addr: number, v: number) {
    addr >>>= 0
    this.writeByte(addr, v)
    this.writeByte(addr + 1, v >>> 8)
    this.writeByte(addr + 2, v >>> 16)
    this.writeByte(addr + 3, v >>> 24)
  }

  readString(addr: number, max = 4096): string {
    let s = ''
    for (let i = 0; i < max; i++) {
      const c = this.readByte(addr + i)
      if (c === 0) break
      s += String.fromCharCode(c)
    }
    return s
  }
}
