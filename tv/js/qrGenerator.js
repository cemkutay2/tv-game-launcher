/**
 * Lightweight, zero-dependency QR Code generator for on-canvas rendering in Phaser.
 * Pure mathematical implementation (Byte encoding mode, ECC Level M).
 * Generates a clean 2D boolean matrix of dark/light modules.
 */

(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.QRCodeGenerator = factory();
    }
}(typeof self !== 'undefined' ? self : this, function() {

    // Polynomial Galois Field 256 math for Reed-Solomon Error Correction
    const EXP_TABLE = new Uint8Array(256);
    const LOG_TABLE = new Uint8Array(256);
    for (let i = 0, x = 1; i < 255; i++) {
        EXP_TABLE[i] = x;
        LOG_TABLE[x] = i;
        x <<= 1;
        if (x & 256) x ^= 0x11d;
    }
    EXP_TABLE[255] = EXP_TABLE[0];

    function glog(n) {
        if (n < 1) throw new Error("glog(" + n + ")");
        return LOG_TABLE[n];
    }
    function gexp(n) {
        while (n < 0) n += 255;
        while (n >= 255) n -= 255;
        return EXP_TABLE[n];
    }

    function polyMultiply(p1, p2) {
        const num = new Uint8Array(p1.length + p2.length - 1);
        for (let i = 0; i < p1.length; i++) {
            for (let j = 0; j < p2.length; j++) {
                num[i + j] ^= gexp(glog(p1[i]) + glog(p2[j]));
            }
        }
        return num;
    }

    function polyMod(dividend, divisor) {
        let result = new Uint8Array(dividend);
        while (result.length >= divisor.length) {
            const coeff = result[0];
            if (coeff !== 0) {
                const logCoeff = glog(coeff);
                for (let i = 0; i < divisor.length; i++) {
                    result[i] ^= gexp(logCoeff + glog(divisor[i]));
                }
            }
            // Strip leading zeros
            let lead = 0;
            while (lead < result.length && result[lead] === 0) lead++;
            result = result.subarray(lead);
        }
        return result;
    }

    function getGeneratorPoly(degree) {
        let poly = new Uint8Array([1]);
        for (let i = 0; i < degree; i++) {
            poly = polyMultiply(poly, new Uint8Array([1, gexp(i)]));
        }
        return poly;
    }

    // Capacity table for Version 1 to Version 5, ECC Level M (byte mode capacity)
    // Version: [moduleCount, totalBytes, ecBytesPerBlock, blocks]
    const VERSION_SPECS = [
        null, // 0
        { ver: 1, size: 21, totalDataBytes: 16, ecBytes: 10, totalCodewords: 26 },
        { ver: 2, size: 25, totalDataBytes: 28, ecBytes: 16, totalCodewords: 44 },
        { ver: 3, size: 29, totalDataBytes: 44, ecBytes: 26, totalCodewords: 70 },
        { ver: 4, size: 33, totalDataBytes: 64, ecBytes: 36, totalCodewords: 100 },
        { ver: 5, size: 37, totalDataBytes: 86, ecBytes: 48, totalCodewords: 134 }
    ];

    // Alignment pattern locations
    const ALIGN_PATTERNS = [
        null,
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30]
    ];

    function pickVersion(dataLen) {
        for (let v = 1; v <= 5; v++) {
            // Byte mode: 4 bits mode + 8 bits count + dataLen*8 <= totalDataBytes * 8
            const overhead = 2; // ~2 bytes for headers
            if (dataLen + overhead <= VERSION_SPECS[v].totalDataBytes) {
                return VERSION_SPECS[v];
            }
        }
        return VERSION_SPECS[5];
    }

    class BitBuffer {
        constructor() {
            this.buffer = [];
            this.length = 0;
        }
        put(num, length) {
            for (let i = 0; i < length; i++) {
                this.putBit(((num >>> (length - i - 1)) & 1) === 1);
            }
        }
        putBit(bit) {
            const byteIndex = Math.floor(this.length / 8);
            if (this.buffer.length <= byteIndex) {
                this.buffer.push(0);
            }
            if (bit) {
                this.buffer[byteIndex] |= (0x80 >>> (this.length % 8));
            }
            this.length++;
        }
    }

    class QRCode {
        constructor(text) {
            this.text = text;
            const utf8Bytes = [];
            for (let i = 0; i < text.length; i++) {
                let c = text.charCodeAt(i);
                if (c < 128) utf8Bytes.push(c);
                else if (c < 2048) {
                    utf8Bytes.push((c >> 6) | 192, (c & 63) | 128);
                } else {
                    utf8Bytes.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
                }
            }
            this.rawBytes = utf8Bytes;
            this.spec = pickVersion(utf8Bytes.length);
            this.size = this.spec.size;
            this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(null));
            this.isReserved = Array.from({ length: this.size }, () => Array(this.size).fill(false));

            this.buildMatrix();
        }

        buildMatrix() {
            this.setupPositionPatterns();
            this.setupTimingPatterns();
            this.setupAlignmentPatterns();
            this.reserveFormatInfo();

            const dataBits = this.createDataBits();
            this.placeDataBits(dataBits);
            this.applyBestMask();
        }

        setupPositionPattern(row, col) {
            for (let r = -1; r <= 7; r++) {
                for (let c = -1; c <= 7; c++) {
                    const currRow = row + r;
                    const currCol = col + c;
                    if (currRow >= 0 && currRow < this.size && currCol >= 0 && currCol < this.size) {
                        this.isReserved[currRow][currCol] = true;
                        if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                            (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                            (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                            this.modules[currRow][currCol] = true;
                        } else {
                            this.modules[currRow][currCol] = false;
                        }
                    }
                }
            }
        }

        setupPositionPatterns() {
            this.setupPositionPattern(0, 0);
            this.setupPositionPattern(0, this.size - 7);
            this.setupPositionPattern(this.size - 7, 0);
        }

        setupTimingPatterns() {
            for (let i = 8; i < this.size - 8; i++) {
                const val = (i % 2 === 0);
                if (!this.isReserved[6][i]) {
                    this.modules[6][i] = val;
                    this.isReserved[6][i] = true;
                }
                if (!this.isReserved[i][6]) {
                    this.modules[i][6] = val;
                    this.isReserved[i][6] = true;
                }
            }
        }

        setupAlignmentPatterns() {
            const coords = ALIGN_PATTERNS[this.spec.ver];
            if (!coords || coords.length === 0) return;

            for (const r of coords) {
                for (const c of coords) {
                    if (this.isReserved[r][c]) continue;

                    for (let y = -2; y <= 2; y++) {
                        for (let x = -2; x <= 2; x++) {
                            const isOuter = Math.abs(x) === 2 || Math.abs(y) === 2;
                            const isCenter = x === 0 && y === 0;
                            this.modules[r + y][c + x] = isOuter || isCenter;
                            this.isReserved[r + y][c + x] = true;
                        }
                    }
                }
            }
        }

        reserveFormatInfo() {
            for (let i = 0; i < 9; i++) {
                if (i < this.size) {
                    this.isReserved[i][8] = true;
                    this.isReserved[8][i] = true;
                }
            }
            for (let i = 0; i < 8; i++) {
                this.isReserved[this.size - 1 - i][8] = true;
                this.isReserved[8][this.size - 1 - i] = true;
            }
        }

        createDataBits() {
            const bb = new BitBuffer();
            // Mode: Byte (0100)
            bb.put(4, 4);
            // Count
            bb.put(this.rawBytes.length, 8);
            // Data
            for (const b of this.rawBytes) {
                bb.put(b, 8);
            }
            // Terminator
            const totalBits = this.spec.totalDataBytes * 8;
            for (let i = 0; i < 4 && bb.length < totalBits; i++) {
                bb.putBit(false);
            }
            // Padding to byte boundary
            while (bb.length % 8 !== 0) {
                bb.putBit(false);
            }
            // Pad bytes
            const padBytes = [0xEC, 0x11];
            let padIdx = 0;
            while (bb.length < totalBits) {
                bb.put(padBytes[padIdx % 2], 8);
                padIdx++;
            }

            // Generate Reed-Solomon Error Correction Code
            const dataBytes = new Uint8Array(bb.buffer.slice(0, this.spec.totalDataBytes));
            const genPoly = getGeneratorPoly(this.spec.ecBytes);
            const paddedData = new Uint8Array(dataBytes.length + this.spec.ecBytes);
            paddedData.set(dataBytes);

            const ecBytes = polyMod(paddedData, genPoly);

            // Final codeword stream
            const finalCodewords = new Uint8Array(this.spec.totalCodewords);
            finalCodewords.set(dataBytes, 0);
            finalCodewords.set(ecBytes, dataBytes.length);

            // Convert back to boolean bits
            const bits = [];
            for (let i = 0; i < finalCodewords.length; i++) {
                for (let b = 7; b >= 0; b--) {
                    bits.push(((finalCodewords[i] >>> b) & 1) === 1);
                }
            }
            return bits;
        }

        placeDataBits(bits) {
            let bitIdx = 0;
            let dir = -1; // Going upwards
            let row = this.size - 1;
            let col = this.size - 1;

            while (col > 0) {
                if (col === 6) col--; // Skip vertical timing column

                for (let i = 0; i < this.size; i++) {
                    const r = row;
                    for (let c = col; c >= col - 1; c--) {
                        if (!this.isReserved[r][c]) {
                            const val = bitIdx < bits.length ? bits[bitIdx++] : false;
                            this.modules[r][c] = val;
                        }
                    }
                    row += dir;
                }

                dir = -dir;
                row += dir;
                col -= 2;
            }
        }

        applyBestMask() {
            // Mask pattern 0: (row + col) % 2 === 0
            // Format info for Level M + Mask 0: 0x5412 ^ 0x5412 = 0b101010000010010
            const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (!this.isReserved[r][c]) {
                        if ((r + c) % 2 === 0) {
                            this.modules[r][c] = !this.modules[r][c];
                        }
                    }
                }
            }

            // Write Format Information
            for (let i = 0; i < 15; i++) {
                const bit = formatBits[i] === 1;
                // Top-left
                if (i <= 5) this.modules[i][8] = bit;
                else if (i === 6) this.modules[7][8] = bit;
                else if (i === 7) this.modules[8][8] = bit;
                else if (i === 8) this.modules[8][7] = bit;
                else this.modules[8][14 - i] = bit;

                // Split format info
                if (i < 8) {
                    this.modules[8][this.size - i - 1] = bit;
                } else {
                    this.modules[this.size - 15 + i][8] = bit;
                }
            }
            // Always dark module
            this.modules[this.size - 8][8] = true;
        }

        /**
         * Renders the QR code directly into a Phaser Graphics object.
         * @param {Phaser.GameObjects.Graphics} graphics
         * @param {number} x
         * @param {number} y
         * @param {number} sizePx
         * @param {number} colorDark
         * @param {number} colorLight
         */
        renderToGraphics(graphics, x, y, sizePx = 240, colorDark = 0x000000, colorLight = 0xFFFFFF) {
            const moduleSize = sizePx / (this.size + 4); // 2-module quiet border
            const quietZone = moduleSize * 2;

            graphics.fillStyle(colorLight, 1);
            graphics.fillRoundedRect(x, y, sizePx, sizePx, 16);

            graphics.fillStyle(colorDark, 1);
            for (let r = 0; r < this.size; r++) {
                for (let c = 0; c < this.size; c++) {
                    if (this.modules[r][c]) {
                        const mx = x + quietZone + (c * moduleSize);
                        const my = y + quietZone + (r * moduleSize);
                        graphics.fillRect(Math.round(mx), Math.round(my), Math.ceil(moduleSize), Math.ceil(moduleSize));
                    }
                }
            }
        }
    }

    return {
        create: function(text) {
            return new QRCode(text);
        }
    };
}));
