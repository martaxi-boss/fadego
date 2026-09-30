export type QrMatrix = boolean[][]

type QrVersion = {
  version: number
  dataCodewords: number
  eccPerBlock: number
  blocks: Array<{ count: number; dataCodewords: number }>
  alignment: number[]
}

const VERSIONS: QrVersion[] = [
  { version: 1, dataCodewords: 19, eccPerBlock: 7, blocks: [{ count: 1, dataCodewords: 19 }], alignment: [] },
  { version: 2, dataCodewords: 34, eccPerBlock: 10, blocks: [{ count: 1, dataCodewords: 34 }], alignment: [6, 18] },
  { version: 3, dataCodewords: 55, eccPerBlock: 15, blocks: [{ count: 1, dataCodewords: 55 }], alignment: [6, 22] },
  { version: 4, dataCodewords: 80, eccPerBlock: 20, blocks: [{ count: 1, dataCodewords: 80 }], alignment: [6, 26] },
  { version: 5, dataCodewords: 108, eccPerBlock: 26, blocks: [{ count: 1, dataCodewords: 108 }], alignment: [6, 30] },
  { version: 6, dataCodewords: 136, eccPerBlock: 18, blocks: [{ count: 2, dataCodewords: 68 }], alignment: [6, 34] },
  { version: 7, dataCodewords: 156, eccPerBlock: 20, blocks: [{ count: 2, dataCodewords: 78 }], alignment: [6, 22, 38] },
  { version: 8, dataCodewords: 194, eccPerBlock: 24, blocks: [{ count: 2, dataCodewords: 97 }], alignment: [6, 24, 42] },
  { version: 9, dataCodewords: 232, eccPerBlock: 30, blocks: [{ count: 2, dataCodewords: 116 }], alignment: [6, 26, 46] },
]

const appendBits = (target: number[], value: number, length: number) => {
  for (let shift = length - 1; shift >= 0; shift -= 1) {
    target.push((value >>> shift) & 1)
  }
}

const bytesFromBits = (bits: number[]) => {
  const bytes: number[] = []
  for (let index = 0; index < bits.length; index += 8) {
    let value = 0
    for (let offset = 0; offset < 8; offset += 1) {
      value = (value << 1) | (bits[index + offset] ?? 0)
    }
    bytes.push(value)
  }
  return bytes
}

const buildDataCodewords = (text: string, version: QrVersion) => {
  const bytes = Array.from(new TextEncoder().encode(text))
  if (bytes.length > 255) {
    throw new Error("QR payload is too long.")
  }

  const capacityBits = version.dataCodewords * 8
  const bits: number[] = []
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, 8)
  for (const byte of bytes) appendBits(bits, byte, 8)

  if (bits.length > capacityBits) {
    throw new Error("QR payload does not fit this version.")
  }

  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const result = bytesFromBits(bits)
  let pad = 0
  while (result.length < version.dataCodewords) {
    result.push(pad % 2 === 0 ? 0xec : 0x11)
    pad += 1
  }
  return result
}

const buildGaloisTables = () => {
  const exp = new Array<number>(512).fill(0)
  const log = new Array<number>(256).fill(0)
  let value = 1
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value
    log[value] = index
    value <<= 1
    if (value & 0x100) value ^= 0x11d
  }
  for (let index = 255; index < 512; index += 1) {
    exp[index] = exp[index - 255] ?? 0
  }
  return { exp, log }
}

const GF = buildGaloisTables()

const gfMultiply = (left: number, right: number) => {
  if (left === 0 || right === 0) return 0
  const leftLog = GF.log[left] ?? 0
  const rightLog = GF.log[right] ?? 0
  return GF.exp[leftLog + rightLog] ?? 0
}

const generatorPolynomial = (degree: number) => {
  let polynomial = [1]
  for (let index = 0; index < degree; index += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0)
    const root = GF.exp[index] ?? 0
    for (let item = 0; item < polynomial.length; item += 1) {
      const coefficient = polynomial[item] ?? 0
      next[item] = (next[item] ?? 0) ^ coefficient
      next[item + 1] =
        (next[item + 1] ?? 0) ^ gfMultiply(coefficient, root)
    }
    polynomial = next
  }
  return polynomial
}

const reedSolomon = (data: number[], degree: number) => {
  const generator = generatorPolynomial(degree)
  const message = [...data, ...new Array<number>(degree).fill(0)]

  for (let index = 0; index < data.length; index += 1) {
    const factor = message[index] ?? 0
    if (factor === 0) continue
    for (let offset = 0; offset < generator.length; offset += 1) {
      message[index + offset] =
        (message[index + offset] ?? 0) ^
        gfMultiply(generator[offset] ?? 0, factor)
    }
  }

  return message.slice(data.length)
}

const addErrorCorrection = (data: number[], version: QrVersion) => {
  const dataBlocks: number[][] = []
  let cursor = 0

  for (const group of version.blocks) {
    for (let blockIndex = 0; blockIndex < group.count; blockIndex += 1) {
      dataBlocks.push(
        data.slice(cursor, cursor + group.dataCodewords),
      )
      cursor += group.dataCodewords
    }
  }

  if (cursor !== data.length) {
    throw new Error("QR block configuration is inconsistent.")
  }

  const eccBlocks = dataBlocks.map((block) =>
    reedSolomon(block, version.eccPerBlock),
  )
  const interleaved: number[] = []
  const longestData = Math.max(...dataBlocks.map((block) => block.length))

  for (let index = 0; index < longestData; index += 1) {
    for (const block of dataBlocks) {
      if (index < block.length) interleaved.push(block[index] ?? 0)
    }
  }

  for (let index = 0; index < version.eccPerBlock; index += 1) {
    for (const block of eccBlocks) {
      interleaved.push(block[index] ?? 0)
    }
  }

  return interleaved
}

const bchFormatBits = (mask: number) => {
  const data = (0b01 << 3) | mask
  let remainder = data
  for (let index = 0; index < 10; index += 1) {
    remainder =
      (remainder << 1) ^
      (((remainder >>> 9) & 1) !== 0 ? 0x537 : 0)
  }
  return ((data << 10) | remainder) ^ 0x5412
}

const bchVersionBits = (version: number) => {
  let remainder = version
  for (let index = 0; index < 12; index += 1) {
    remainder =
      (remainder << 1) ^
      (((remainder >>> 11) & 1) !== 0 ? 0x1f25 : 0)
  }
  return (version << 12) | remainder
}

const drawFunctionPatterns = (
  modules: boolean[][],
  functions: boolean[][],
  version: QrVersion,
) => {
  const size = modules.length
  const set = (row: number, column: number, dark: boolean) => {
    if (row < 0 || column < 0 || row >= size || column >= size) return
    const moduleRow = modules[row]
    const functionRow = functions[row]
    if (!moduleRow || !functionRow) return
    moduleRow[column] = dark
    functionRow[column] = true
  }

  const finder = (top: number, left: number) => {
    for (let row = -1; row <= 7; row += 1) {
      for (let column = -1; column <= 7; column += 1) {
        const inside =
          row >= 0 && row <= 6 && column >= 0 && column <= 6
        const dark =
          inside &&
          (row === 0 ||
            row === 6 ||
            column === 0 ||
            column === 6 ||
            (row >= 2 && row <= 4 && column >= 2 && column <= 4))
        set(top + row, left + column, dark)
      }
    }
  }

  finder(0, 0)
  finder(0, size - 7)
  finder(size - 7, 0)

  for (let index = 8; index < size - 8; index += 1) {
    set(6, index, index % 2 === 0)
    set(index, 6, index % 2 === 0)
  }

  for (const row of version.alignment) {
    for (const column of version.alignment) {
      if (functions[row]?.[column]) continue
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy))
          set(row + dy, column + dx, distance !== 1)
        }
      }
    }
  }

  for (let index = 0; index < 6; index += 1) set(index, 8, false)
  set(7, 8, false)
  set(8, 8, false)
  set(8, 7, false)
  for (let index = 9; index < 15; index += 1) {
    set(8, 14 - index, false)
  }

  for (let index = 0; index < 8; index += 1) {
    set(8, size - 1 - index, false)
  }
  for (let index = 8; index < 15; index += 1) {
    set(size - 15 + index, 8, false)
  }

  set(size - 8, 8, true)

  if (version.version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      const a = size - 11 + (index % 3)
      const b = Math.floor(index / 3)
      set(b, a, false)
      set(a, b, false)
    }
  }
}

const drawCodewords = (
  modules: boolean[][],
  functions: boolean[][],
  codewords: number[],
) => {
  const size = modules.length
  const bits: number[] = []
  for (const byte of codewords) appendBits(bits, byte, 8)

  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    const upward = ((right + 1) & 2) === 0

    for (let vertical = 0; vertical < size; vertical += 1) {
      const row = upward ? size - 1 - vertical : vertical
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset
        if (functions[row]?.[column]) continue
        const moduleRow = modules[row]
        if (!moduleRow) continue
        moduleRow[column] = (bits[bitIndex] ?? 0) === 1
        bitIndex += 1
      }
    }
  }
}

const applyMaskZero = (modules: boolean[][], functions: boolean[][]) => {
  for (let row = 0; row < modules.length; row += 1) {
    for (let column = 0; column < modules.length; column += 1) {
      if (!functions[row]?.[column] && (row + column) % 2 === 0) {
        const moduleRow = modules[row]
        if (moduleRow) moduleRow[column] = !moduleRow[column]
      }
    }
  }
}

const drawMetadata = (
  modules: boolean[][],
  functions: boolean[][],
  version: QrVersion,
) => {
  const size = modules.length
  const set = (row: number, column: number, dark: boolean) => {
    const moduleRow = modules[row]
    const functionRow = functions[row]
    if (!moduleRow || !functionRow) return
    moduleRow[column] = dark
    functionRow[column] = true
  }

  const format = bchFormatBits(0)
  const bit = (index: number) => ((format >>> index) & 1) !== 0

  for (let index = 0; index < 6; index += 1) set(index, 8, bit(index))
  set(7, 8, bit(6))
  set(8, 8, bit(7))
  set(8, 7, bit(8))
  for (let index = 9; index < 15; index += 1) {
    set(8, 14 - index, bit(index))
  }

  for (let index = 0; index < 8; index += 1) {
    set(8, size - 1 - index, bit(index))
  }
  for (let index = 8; index < 15; index += 1) {
    set(size - 15 + index, 8, bit(index))
  }
  set(size - 8, 8, true)

  if (version.version >= 7) {
    const versionBits = bchVersionBits(version.version)
    for (let index = 0; index < 18; index += 1) {
      const dark = ((versionBits >>> index) & 1) !== 0
      const a = size - 11 + (index % 3)
      const b = Math.floor(index / 3)
      set(b, a, dark)
      set(a, b, dark)
    }
  }
}

export const privateQrPayload = (currentHref: string) => currentHref

export const buildQrMatrix = (text: string): QrMatrix => {
  let selected: QrVersion | null = null
  let data: number[] | null = null

  for (const version of VERSIONS) {
    try {
      data = buildDataCodewords(text, version)
      selected = version
      break
    } catch {
      // Try the next QR version without changing the payload.
    }
  }

  if (!selected || !data) {
    throw new Error("Private booking URL is too long for local QR generation.")
  }

  const size = 17 + selected.version * 4
  const modules = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  )
  const functions = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false),
  )

  drawFunctionPatterns(modules, functions, selected)
  drawCodewords(modules, functions, addErrorCorrection(data, selected))
  applyMaskZero(modules, functions)
  drawMetadata(modules, functions, selected)

  return modules
}
