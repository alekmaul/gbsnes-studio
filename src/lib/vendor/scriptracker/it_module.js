"use strict";

var Module     = require("./module");
var Pattern    = require("./pattern");
var Instrument = require("./instrument");
var Sample     = require("./sample");
var Envelope   = require("./envelope");
var Effects    = require("./effects");
var Helpers    = require("./helpers");

/**
 * ItModule.js
 *
 * Loader for Impulse Tracker (.it) modules. Returns a generic ScripTracker Module object for playback - the
 * editor's own "Play" preview, independent of the real SNES build (compileSnesMusic.js/itValidate.js), which
 * hands a project .it to the vendored smconv binary instead. Byte offsets below are cross-checked against
 * smconv's own real upstream IT loader source (pvsneslib/tools/smconv/itloader.cpp), not just the IT spec,
 * since that's the parser a project's .it ultimately has to satisfy to build at all.
 *
 * Two real-world shapes smconv itself cannot handle, that this preview loader handles anyway (it never goes
 * near smconv, so neither limitation applies here):
 *  - A sample-mode .it (InstrumentCount 0, "old"/direct mode - see itValidate.js) plays fine here: one
 *    synthetic pass-through Instrument is built per Sample, exactly like the S3M loader already does for a
 *    format that never had an instrument concept at all.
 *  - IT214-compressed samples are not decoded (same limitation itValidate.js enforces at build time, just
 *    not fatal here) - a compressed sample is left silent (empty sample data) rather than decoded or crashed
 *    on, since this preview has no decoder for Jmir's IT compression scheme.
 */
var ItModule = function(fileData) {
	Module.call(this);
	this.type = Module.Types.IT;

	this.name = Helpers.readString(fileData, 0x04, 26);

	var ordNum = Helpers.readWord(fileData, 0x20);
	var insNum = Helpers.readWord(fileData, 0x22);
	var smpNum = Helpers.readWord(fileData, 0x24);
	var patNum = Helpers.readWord(fileData, 0x26);

	this.defaultTempo = fileData[0x32] || 6;			// InitialSpeed: ticks per row.
	this.defaultBPM   = Math.max(32, fileData[0x33] || 125);	// InitialTempo: BPM.
	this.restartPosition = 0;			// IT has no explicit restart order field; song end restarts at order 0.

	this.channels = 64;				// IT's hardware channel ceiling - unused channels just never appear in pattern data.

	// Order table.
	for (var i = 0; i < ordNum; i ++) {
		this.orders.push(fileData[0xc0 + i]);
	}
	this.songLength = this.orders.length;

	// Instrument / sample / pattern pointer tables, immediately after the order table - same layout
	// itValidate.js's own header parsing relies on.
	var ptrTableStart = 0xc0 + ordNum;
	var insPtrs = [];
	for (var i = 0; i < insNum; i ++) {
		insPtrs.push(Helpers.readDWord(fileData, ptrTableStart + i * 4));
	}
	var smpPtrs = [];
	for (var i = 0; i < smpNum; i ++) {
		smpPtrs.push(Helpers.readDWord(fileData, ptrTableStart + insNum * 4 + i * 4));
	}
	var patPtrs = [];
	for (var i = 0; i < patNum; i ++) {
		patPtrs.push(Helpers.readDWord(fileData, ptrTableStart + insNum * 4 + smpNum * 4 + i * 4));
	}

	// Samples are always loaded, whether or not the file uses instruments - a sample-mode pattern cell
	// references one of these directly by number.
	var sampleList = [];
	for (var i = 0; i < smpNum; i ++) {
		sampleList.push(this.loadSample(fileData, smpPtrs[i]));
	}

	// Instrument mode is decided the same way itValidate.js decides a build-breaking "no instruments" track:
	// by InstrumentCount, not the header's "use instruments" flag (which isn't read anywhere in smconv's own
	// loader either - only InstrumentCount actually gates whether any Instrument objects get built).
	if (insNum > 0) {
		for (var i = 0; i < insNum; i ++) {
			this.instruments.push(this.loadInstrument(fileData, insPtrs[i], sampleList));
		}
	} else {
		// Sample-direct mode: synthesize one pass-through instrument per sample (same approach the S3M
		// loader already uses, since S3M has no instrument concept at all) so sample N is still reachable
		// as "instrument" N from a pattern cell.
		for (var i = 0; i < sampleList.length; i ++) {
			var instrument = new Instrument();
			instrument.name = sampleList[i].name;
			instrument.samples.push(sampleList[i]);
			this.instruments.push(instrument);
		}
	}
	this.instrumentCount = this.instruments.length;

	for (var p = 0; p < patNum; p ++) {
		this.patterns.push(this.loadPattern(fileData, patPtrs[p], this.channels));
	}
	this.patternCount = this.patterns.length;
};
ItModule.prototype = Object.create(Module.prototype);


/**
 * Load one IMPS sample block (80 bytes fixed header, PCM data elsewhere in the file via its own pointer).
 * Offsets match itloader.cpp's Sample::Sample/LoadData exactly.
 */
ItModule.prototype.loadSample = function(fileData, ptr) {
	var sample = new Sample();
	if (!ptr) return sample;

	var flags      = fileData[ptr + 0x12];
	var hasSample  = (flags & 0x01) !== 0;
	var is16Bit    = (flags & 0x02) !== 0;
	var compressed = (flags & 0x08) !== 0;
	var hasLoop    = (flags & 0x10) !== 0;
	var bidiLoop   = (flags & 0x40) !== 0;

	sample.name       = Helpers.readString(fileData, ptr + 0x14, 26);
	sample.volume     = fileData[ptr + 0x13] / 64.0;
	sample.sampleBits = is16Bit ? Sample.Bits.FORMAT_16BIT : Sample.Bits.FORMAT_8BIT;

	// Convert byte bit 0: samples are stored already-signed if set, otherwise unsigned (offset by 128/32768) -
	// itloader.cpp: `(Convert&1) ? 0 : (Bits16 ? -32768 : -128)`.
	var signed = (fileData[ptr + 0x2e] & 0x01) !== 0;

	sample.sampleLength = Helpers.readDWord(fileData, ptr + 0x30);
	sample.loopStart    = Helpers.readDWord(fileData, ptr + 0x34);
	var loopEnd           = Helpers.readDWord(fileData, ptr + 0x38);
	sample.loopLength   = hasLoop ? Math.max(0, loopEnd - sample.loopStart) : 0;
	sample.loopType     = !hasLoop ? Sample.LoopType.NONE : (bidiLoop ? Sample.LoopType.PINGPONG : Sample.LoopType.FORWARD);

	// C5Speed -> the same relative-semitone "basePeriod" the S3M loader derives from its own C4Speed (only
	// consumed by the TONE_PORTA effect); 8363 Hz is the shared reference frequency both formats use.
	var c5Speed = Helpers.readDWord(fileData, ptr + 0x3c) || 8363;
	sample.basePeriod = Math.log(c5Speed / 8363) / Math.log(2) * 768 + 3168;
	sample.basePeriod = -(Math.floor(sample.basePeriod / 64) - 72);
	sample.fineTune = 0;	// IT has no separate finetune field like MOD - fine pitch is entirely in C5Speed.

	if (hasSample && sample.sampleLength > 0) {
		if (compressed) {
			// IT214 sample compression isn't decoded here (same limitation itValidate.js enforces at build
			// time) - leave the sample silent rather than decode garbage or throw.
			sample.sampleLength = 0;
		} else {
			var samplePointer = Helpers.readDWord(fileData, ptr + 0x48);
			var byteLength     = sample.sampleLength * (is16Bit ? 2 : 1);
			var sampleData     = fileData.subarray(samplePointer, samplePointer + byteLength);
			sample.loadSample(sampleData, signed);
		}
	}

	return sample;
};


/**
 * Load one IMPI instrument block: a 120-entry note->sample Notemap plus volume/panning envelopes. Offsets
 * match itloader.cpp's Instrument::Instrument/Envelope::Envelope exactly.
 */
ItModule.prototype.loadInstrument = function(fileData, ptr, sampleList) {
	var instrument = new Instrument();
	if (!ptr) return instrument;

	instrument.name = Helpers.readString(fileData, ptr + 0x1f, 26);

	// Samples are shared/global (not duplicated per instrument) - Notemap.Sample below is already a global,
	// 1-based sample index, so no local remapping is needed.
	instrument.samples = sampleList;

	for (var note = 0; note < 120 && note < instrument.sampleKeyMap.length; note ++) {
		instrument.sampleKeyMap[note] = fileData[ptr + 0x40 + note * 2 + 1];
	}

	var envelopeBlockSize = 0x51;	// FLG+Length+LoopStart+LoopEnd+SustainStart+SustainEnd (6) + 25 nodes * 3.
	instrument.volumeEnvelope  = this.loadEnvelope(fileData, ptr + 0x130);
	instrument.panningEnvelope = this.loadEnvelope(fileData, ptr + 0x130 + envelopeBlockSize);
	// A pitch envelope follows at +envelopeBlockSize*2 - the generic Instrument has no slot for it (XM's own
	// loader has the same gap), so it's intentionally not read.

	return instrument;
};


ItModule.prototype.loadEnvelope = function(fileData, ptr) {
	var envelope = new Envelope();

	var flg = fileData[ptr];
	// IT's own FLG bits (bit0 Enabled, bit1 Loop, bit2 Sustain) do not line up with the generic Envelope's
	// bits (bit0 ON, bit1 SUSTAIN, bit2 LOOP) - 1 and 2 are swapped between the two, so this remaps them
	// rather than copying the byte through directly.
	var enabled = (flg & 0x01) !== 0;
	var loop    = (flg & 0x02) !== 0;
	var sustain = (flg & 0x04) !== 0;
	envelope.type = (enabled ? Envelope.EnvelopeType.ON : 0) |
		(sustain ? Envelope.EnvelopeType.SUSTAIN : 0) |
		(loop ? Envelope.EnvelopeType.LOOP : 0);

	var numNodes     = fileData[ptr + 1];
	var loopStart    = fileData[ptr + 2];
	var loopEnd      = fileData[ptr + 3];
	var sustainStart = fileData[ptr + 4];

	for (var n = 0; n < numNodes && n < 25; n ++) {
		var nodeOffset = ptr + 6 + n * 3;
		var y = fileData[nodeOffset];
		var x = Helpers.readWord(fileData, nodeOffset + 1);

		// Both volume and panning envelope nodes use the same 0-64 Y range (a panning node's 32 is center) -
		// same normalisation the XM loader applies to its own 0-64 envelope points.
		envelope.addPoint(
			x,
			Math.min(y / 64, 1),
			n === sustainStart,
			n === loopStart,
			n === loopEnd
		);
	}

	return envelope;
};


/**
 * Unpack one unpacked-on-demand IT pattern. Real IT pattern cells are a compact per-channel diff format: a
 * channel-variable byte, optionally followed by a mask byte (bit0-3 "this field has a new value next",
 * bit4-7 "repeat the last value for this field, no new byte"); fields present (new or repeated) are applied
 * to that channel/row, fields absent keep the pattern's default (empty note / no instrument / no volume / no
 * effect). A pattern pointer of 0 means a blank pattern.
 */
ItModule.prototype.loadPattern = function(fileData, ptr, channels) {
	if (!ptr) return new Pattern(64, channels);

	var dataLength = Helpers.readWord(fileData, ptr);
	var rows       = Helpers.readWord(fileData, ptr + 2);
	var pattern = new Pattern(rows, channels);

	if (dataLength === 0) return pattern;

	var pos = ptr + 8;		// DataLength(2) + Rows(2) + reserved(4) = 8-byte pattern header.
	var end = pos + dataLength;

	var lastMask = [], lastNote = [], lastInstr = [], lastVolume = [], lastEffect = [], lastParam = [];
	for (var c = 0; c < channels; c ++) {
		lastMask[c]   = 0;
		lastNote[c]   = 0;
		lastInstr[c]  = 0;
		lastVolume[c] = -1;
		lastEffect[c] = Effects.NONE;
		lastParam[c]  = 0;
	}

	var row = 0;
	while (row < rows && pos < end) {
		var chvar = fileData[pos ++];
		if (chvar === 0) {
			row ++;
			continue;
		}

		var channel = (chvar - 1) & 63;
		var mask;
		if (chvar & 0x80) {
			mask = fileData[pos ++];
			lastMask[channel] = mask;
		} else {
			mask = lastMask[channel];
		}

		if (mask & 0x01) lastNote[channel]   = this.decodeNote(fileData[pos ++]);
		if (mask & 0x02) lastInstr[channel]  = fileData[pos ++];
		if (mask & 0x04) lastVolume[channel] = this.decodeVolume(fileData[pos ++]);
		if (mask & 0x08) {
			var cmd   = fileData[pos ++];
			var param = fileData[pos ++];
			lastEffect[channel] = this.decodeEffect(cmd, param);
			lastParam[channel]  = this.decodeEffectParam(cmd, param);
		}

		if (channel < channels && row < rows) {
			if (mask & 0x11) pattern.note[row][channel]       = lastNote[channel];
			if (mask & 0x22) pattern.instrument[row][channel] = lastInstr[channel];
			if (mask & 0x44) pattern.volume[row][channel]     = lastVolume[channel];
			if (mask & 0x88) {
				pattern.effect[row][channel]      = lastEffect[channel];
				pattern.effectParam[row][channel] = lastParam[channel];
			}
		}
	}

	return pattern;
};


/**
 * IT note bytes are 0-119 (real pitch), 255 note-off, 254 note-cut - remapped onto the generic 1-based
 * note scheme (1 = lowest note) with 97 as the shared "stop this note" sentinel every loader/the player
 * itself already uses. Note-off and note-cut aren't distinguished - the player has no separate hard-cut
 * trigger at the note level (only a scheduled per-tick CUT_NOTE effect), so both just release the note.
 */
ItModule.prototype.decodeNote = function(noteByte) {
	if (noteByte === 255 || noteByte === 254) return 97;
	if (noteByte > 119) return 0;
	return noteByte + 1;
};


/**
 * Only IT's plain "set volume" range (0-64) is implemented. The rest of the volume column (fine slides, pan,
 * portamento, retrigger presets packed into 65-255) uses a completely different byte layout than this
 * player's existing Effects.VOLUME_EFFECT handler (built for XM's own volume-column encoding) - mapping
 * those would silently misinterpret the value rather than do nothing, so they're left unhandled.
 */
ItModule.prototype.decodeVolume = function(volByte) {
	return (volByte <= 64) ? volByte : -1;
};


ItModule.prototype.decodeEffect = function(cmd, param) {
	switch (cmd) {
		case 1: return Effects.SET_SPEED;				// A
		case 2: return Effects.POSITION_JUMP;				// B
		case 3: return Effects.PATTERN_BREAK;				// C
		case 4: return Effects.VOLUME_SLIDE;				// D
		case 5:							// E - Porta Down
			if ((param & 0xF0) === 0xF0) return Effects.FINE_PORTA_DOWN;
			if ((param & 0xF0) === 0xE0) return Effects.EXTRA_FINE_PORTA_DOWN;
			return Effects.PORTA_DOWN;
		case 6:							// F - Porta Up
			if ((param & 0xF0) === 0xF0) return Effects.FINE_PORTA_UP;
			if ((param & 0xF0) === 0xE0) return Effects.EXTRA_FINE_PORTA_UP;
			return Effects.PORTA_UP;
		case 7: return Effects.TONE_PORTA;				// G
		case 8: return Effects.VIBRATO;				// H
		case 9: return Effects.TREMOR;					// I
		case 10: return Effects.ARPEGGIO;				// J
		case 11: return Effects.VIBRATO_VOL_SLIDE;			// K
		case 12: return Effects.TONE_PORTA_VOL_SLIDE;			// L
		case 13: return Effects.SET_VOLUME;				// M - Set Channel Volume (nearest available slot)
		case 14: return Effects.VOLUME_SLIDE;				// N - Channel Volume Slide (same slot as D)
		case 15: return Effects.NONE;					// O - Sample Offset (not implemented)
		case 16: return Effects.PAN_SLIDE;				// P
		case 17: return Effects.RETRIG_VOL_SLIDE;			// Q
		case 18: return Effects.TREMOLO;				// R
		case 19:							// S - special sub-commands
			switch ((param & 0xF0) >> 4) {
				case 0: return Effects.SET_FILTER;
				case 1: return Effects.SET_GLISANDO;
				case 2: return Effects.SET_FINETUNE;
				case 3: return Effects.SET_VIBRATO;
				case 4: return Effects.SET_TREMOLO;
				case 8: return Effects.SET_PAN_16;
				case 11: return Effects.SET_LOOP;
				case 12: return Effects.CUT_NOTE;
				case 13: return Effects.DELAY_NOTE;
				case 14: return Effects.DELAY_PATTERN;
				default: return Effects.NONE;
			}
		case 20: return Effects.SET_TEMPO;				// T
		case 21: return Effects.FINE_VIBRATO;				// U
		case 22: return Effects.SET_GLOBAL_VOLUME;			// V
		case 23: return Effects.GLOBAL_VOLUME_SLIDE;			// W
		case 24: return Effects.SET_PAN_16;				// X - Set Panning (full byte, rescaled below)
		case 25: return Effects.NONE;					// Y - Panbrello (not implemented)
		case 26: return Effects.NONE;					// Z - MIDI Macro (not implemented)
		default: return Effects.NONE;
	}
};


ItModule.prototype.decodeEffectParam = function(cmd, param) {
	if (cmd === 5 || cmd === 6) {			// E/F fine & extra-fine porta use the low nibble as their rate.
		if ((param & 0xF0) === 0xF0 || (param & 0xF0) === 0xE0) return param & 0x0F;
		return param;
	}
	if (cmd === 19) return param & 0x0F;		// S-command sub-parameter.
	if (cmd === 24) return Math.floor(param / 16);	// X - rescale the full-byte 0-255 pan to a 0-15 nibble.
	return param;
};


module.exports = ItModule;
