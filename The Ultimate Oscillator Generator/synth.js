class UOsc {
    constructor(name) {
        this._name = name;
        this._params;
        this._arrayParams = {};
        this._elseOscName;
        this._oscillatorSamples = new Float64Array(48000);
        this._oscillatorMaxAmp = 1;
        this._oscillatorPartialFreqs = [];
        this._oscillatorPartialAmps = [];
        this._oscillatorPartialPhases = [];
    }

    oscillatorPartialFrequencies(partialIndex) {
        const baseFrequency = this._params._wavetype + (this._params._shift * partialIndex + 1) * this._params._pull ** partialIndex - 1;
        const finalFrequency = Math.pow(baseFrequency, (-2 * Math.pow(0, Math.sign((partialIndex + 1) % this._params._partialFrequencyInverter)) + 1) ** Math.sign(this._params._partialFrequencyInverter));

        return finalFrequency;
    }

    oscillatorPartialAmplitudes(partialIndex) {
        const partialFreq = this.oscillatorPartialFrequencies(partialIndex);
        const preCombAmp = this._params._wavetype * (this._params._damping + 0 ** Math.abs(this._params._damping)) * (1 / ((this.logAbs(Math.abs(partialFreq)) ** this._params._damping) || 0));
        if (!Number.isFinite(preCombAmp)) return 0;
        const amp = preCombAmp * Math.ceil(((partialIndex + (Math.sign(this._params._partialComb) + 1) / 2) % (this._params._partialComb|| 1)) / (this._params._partialComb || 1));
        const pwmAmp = amp * Math.PI * (2 * this._params._pwmMix * Math.sin(Math.PI * partialFreq * (this._params._pwmPhase - 180) / 360) + (1 - this._params._pwmMix)) * Math.cos(partialFreq * Math.PI * this._params._flangingPhase / 360);
        const normalization = (2 * Math.PI - Math.acos(Math.cos(Math.PI * (this._params._pwmPhase + this._params._flangingPhase) / 180 + Math.PI))) || 0;

        return pwmAmp / normalization;
    }

    oscillatorPartialPhases(partialIndex, prePWM) {
        const partialFreq = this.oscillatorPartialFrequencies(partialIndex);
        let phase = Math.PI * Math.pow(0, Math.sign((partialIndex + 1) % this._params._partialPhaseShifter));
        if (!Number.isFinite(phase)) phase = 0;
        const pwmPhase = Math.PI * (partialFreq * (2 * phase - this._params._flangingPhase) + partialFreq * this._params._pwmMix * (this._params._pwmPhase - 180) + this._params._pwmMix * 180) / 360;

        if (prePWM) return phase;
        else return phase + pwmPhase;
    };

    tensionFunction(x, p) {
        if (x < -1) return -1;
        else if (x == 0) return 0;
        else if (x > 1) return 1;
        else if (x >= -1 && x < 0) return -((-Math.pow(x + 1, 1 / p) + 1) ** p);
        else if (x > 0 && x <= 1) return (-Math.pow(-x + 1, 1 / p) + 1) ** p;
    }

    logAbs(x) {
        if (x >= -1 && x <= 1) return 1 / x;
        else return x;
    }

    waveVector(angle, partialIndex) {
        return [this._oscillatorPartialAmps[partialIndex] * Math.cos(angle * 2 * Math.PI * this._oscillatorPartialFreqs[partialIndex] + this._oscillatorPartialPhases[partialIndex]),
                this._oscillatorPartialAmps[partialIndex] * Math.sin(angle * 2 * Math.PI * this._oscillatorPartialFreqs[partialIndex] + this._oscillatorPartialPhases[partialIndex])];
    }

    createOscillator(newParams, elseOsc) {
        this._params = newParams;
        this._arrayParams = {};
        for (const [_key, value] of Object.entries(this._params)) {
            if (Array.isArray(value)) {
                this._arrayParams[_key] = value;
                this._params[_key] = value[0];
            }
        }
        this._elseOscName = elseOsc ? elseOsc._name : null;

        this._oscillatorPartialFreqs = [];
        this._oscillatorPartialAmps = [];
        this._oscillatorPartialPhases = [];

        for (let i = 0; i < this._params._partialCount; i++) {
            for (const [_key, value] of Object.entries(this._arrayParams)) {
                this._params[_key] = value[i % value.length];
            }
            this._oscillatorPartialFreqs[i] = this.oscillatorPartialFrequencies(i);
            this._oscillatorPartialAmps[i] = this.oscillatorPartialAmplitudes(i);
            this._oscillatorPartialPhases[i] = this.oscillatorPartialPhases(i, false);
        }
        if ('_wavetype' in this._arrayParams) {
            this._params._wavetype = this._arrayParams._wavetype[0];
        }
        
        if (this._params._isFractal) {
            let fractalOscillatorData;
            let useRealNums = false;
            if ("_pull" in this._arrayParams || "_partialFrequencyInverter" in this._arrayParams) {
                Object.keys(this._arrayParams).forEach(_key => {
                    if (_key == "_pull") {
                        useRealNums = this._arrayParams._pull.some(v => v % 1 != 0);
                        return;
                    } else if (_key == "_partialFrequencyInverter") {
                        useRealNums = this._arrayParams._partialFrequencyInverter.some(v => v != 0);
                        return;
                    }
                });
            }
            if (useRealNums == false || "_pull" in elseOsc._arrayParams || "_partialFrequencyInverter" in elseOsc._arrayParams) {
                Object.keys(elseOsc._arrayParams).forEach(_key => {
                    if (_key == "_pull") {
                        useRealNums = elseOsc._arrayParams._pull.some(v => v % 1 != 0);
                        return;
                    } else if (_key == "_partialFrequencyInverter") {
                        useRealNums = elseOsc._arrayParams._partialFrequencyInverter.some(v => v != 0);
                        return;
                    }
                });
            } 
            if (useRealNums == false) useRealNums = this._params._pull % 1 != 0 || this._params._partialFrequencyInverter != 0 || elseOsc._params._pull % 1 != 0 || elseOsc._params._partialFrequencyInverter != 0;
            
            if (useRealNums) {
                fractalOscillatorData = combinePartialsReal({ frequencies: this._oscillatorPartialFreqs, amplitudes: this._oscillatorPartialAmps, phases: this._oscillatorPartialPhases }, { frequencies: elseOsc._oscillatorPartialFreqs.slice(0, this._params._partialCount), amplitudes: elseOsc._oscillatorPartialAmps.slice(0, this._params._partialCount), phases: elseOsc._oscillatorPartialPhases.slice(0, this._params._partialCount) });
            } else {
                fractalOscillatorData = combinePartialsInteger({ frequencies: this._oscillatorPartialFreqs, amplitudes: this._oscillatorPartialAmps, phases: this._oscillatorPartialPhases }, { frequencies: elseOsc._oscillatorPartialFreqs.slice(0, this._params._partialCount), amplitudes: elseOsc._oscillatorPartialAmps.slice(0, this._params._partialCount), phases: elseOsc._oscillatorPartialPhases.slice(0, this._params._partialCount) });
            }

            this._oscillatorPartialFreqs = fractalOscillatorData.frequencies;
            this._oscillatorPartialAmps = fractalOscillatorData.amplitudes;
            this._oscillatorPartialPhases = fractalOscillatorData.phases;
        }
        
        this._oscillatorMaxAmp = 1;
        let oscillatorSamples = this._oscillatorSamples;
        for (let sample = 0; sample < 48000; sample++) {
            let currentVal = 0;
            for (let partialIndex = 0; partialIndex < this._params._partialCount; partialIndex++) {
                currentVal += this.waveVector(sample / 48000, partialIndex)[1];
            }
            oscillatorSamples[sample] = currentVal;
            if (Math.abs(currentVal) > this._oscillatorMaxAmp) this._oscillatorMaxAmp = Math.abs(currentVal);
        }
    }

    get oscillatorSamples() {
        return this._oscillatorSamples;
    }
}

class UOSynth extends AudioWorkletProcessor {
    constructor() {
        super();
        this._additiveSynthesis = true;
        this._declickSampleTime = 512;

        this.port.onmessage = (event) => {
            console.log('New Message from Main thread: ', event.data);

            switch (event.data.type) {
                case "testing":
                    this.port.postMessage({ data: "received..." });
                    break;
                case "createOsc":
                    this._oscStructure[event.data.oscName] = new UOsc(event.data.oscName);
                    this._selectedOsc = event.data.oscName;
                    this.port.postMessage({ type: "updateSelectedOsc", oscName: this._selectedOsc });
                    console.log(this._oscStructure);
                    break;
                case "deleteOsc":
                    delete this._oscStructure[event.data.oscName];
                    console.log(this._oscStructure);
                    break;
                case "selectOsc":
                    this._selectedOsc = event.data.oscName;
                    if (this._selectedOsc in this._oscStructure) {
                        this.port.postMessage({ type: "Load Oscillator", oscName: this._selectedOsc, parameters: this._oscStructure[this._selectedOsc]._params });
                        this.port.postMessage({ type: "givenOscillator", oscillator: this._oscStructure[this._selectedOsc] });
                    } else {
                        this.port.postMessage({ type: "error", message: "No such oscillator exists." });
                    }
                    break;
                case "synthesize":
                    if (event.data.elseOsc in this._oscStructure || event.data.elseOsc === null) {
                        this.port.postMessage({ type: "Busy", subtype: "synthesizing..." });
                        this._oscStructure[this._selectedOsc].createOscillator(event.data.parameters, this._oscStructure[event.data.elseOsc]);
                        for (let v of this._voices) {
                            if (v.oscName === this._selectedOsc && this._additiveSynthesis) {
                                calcVoicePartials(v, this._oscStructure[this._selectedOsc],
                                (440 * Math.pow(2, (3 + v.frequency) / 12 + (this._octave - 5))) / this._oscStructure[this._selectedOsc]._params._wavetype,
                                48000, { fadeStart: 20000, fadeEnd: 24000, maxPartials: 1024, relThreshold: 1e-6 });
                                v.freeRunMaxVal = 1;
                            }
                        }
                        this.port.postMessage({ type: "Done", subtype: "synthesizing..." });
                        this.port.postMessage({ type: "givenOscillator", oscillator: this._oscStructure[this._selectedOsc] });
                    } else {
                        this.port.postMessage({ type: "error", message: "No such oscillator exists (for the modulating oscillator)." });
                    }
                    break;
                case "renameOsc":
                    if (event.data.oscName in this._oscStructure) {
                        this._oscStructure[event.data.newOscName] = this._oscStructure[event.data.oscName];
                        this._oscStructure[event.data.newOscName]._name = event.data.newOscName;
                        this._oscStructure[event.data.newOscName]._elseOscName = event.data.newOscName;
                        delete this._oscStructure[event.data.oscName];
                        this._selectedOsc = event.data.newOscName;
                    } else {
                        this.port.postMessage({ type: "error", message: "There is no oscillator to rename!" });
                    }
                    break;
                case "loadSession":
                    let allLoadedOscNames = "";
                    this.port.postMessage({ type: "Busy", subtype: "synthesizing..." });
                    Object.keys(event.data.sessionData).forEach((_key) => {
                        this._oscStructure[_key] = new UOsc(_key);
                        allLoadedOscNames += `${_key}, `;
                    });
                    Object.keys(event.data.sessionData).forEach((_key) => {
                        this._oscStructure[_key].createOscillator(event.data.sessionData[_key]._params, this._oscStructure[event.data.sessionData[_key]._elseOscName]);
                    });
                    this.port.postMessage({ type: "Done", subtype: "synthesizing..." });
                    this.port.postMessage({ type: "alert", message: `Session has been loaded successfully. Here are the names of all of your beautiful oscillators: ${allLoadedOscNames.slice(0, allLoadedOscNames.length - 2)}.` });
                    break;
                case "addVoice":
                    let already = false;
                    for (let i = 0; i < this._voices.length; i++) {
                        if (this._voices[i].oscName === event.data.oscName && this._voices[i].frequency === event.data.frequency) {
                            already = true;
                            break;
                        }
                    }
                    if (!already) {
                        this._voices.push({ oscName: event.data.oscName, frequency: event.data.frequency, velocity: event.data.velocity, phase: 0, freeRunMaxVal: 1, sampleCounter: 0, removing: false });
                        if (this._additiveSynthesis) {
                            calcVoicePartials(this._voices[this._voices.length - 1], this._oscStructure[event.data.oscName], (440 * Math.pow(2, (3 + event.data.frequency) / 12 + (this._octave - 5))) / this._oscStructure[event.data.oscName]._params._wavetype, 48000, {
                                fadeStart: 20000,
                                fadeEnd: 24000,
                                maxPartials: 1024,
                                relThreshold: 1e-6
                            });
                        }
                    }
                    break;
                case "removeVoice":
                    for (let voice of this._voices) {
                        if (voice.oscName === event.data.oscName && voice.frequency === event.data.frequency) {
                            voice.removing = true;
                            voice.sampleCounter = this._declickSampleTime - 1;
                            break;
                        }
                    }
                    break;
                case "changeOctave":
                    this._octave += event.data.octave;
                    for (let voice of this._voices) {
                        if (this._additiveSynthesis) {
                            calcVoicePartials(voice, this._oscStructure[voice.oscName], (440 * Math.pow(2, (3 + voice.frequency) / 12 + (this._octave - 5))) / this._oscStructure[voice.oscName]._params._wavetype, 48000, {
                                fadeStart: 20000,
                                fadeEnd: 24000,
                                maxPartials: 1024,
                                relThreshold: 1e-6
                            });
                        }
                    }
                    break;
                case "setOctave":
                    this._octave = event.data.octave;
                    for (let voice of this._voices) {
                        if (this._additiveSynthesis) {
                            calcVoicePartials(voice, this._oscStructure[voice.oscName], (440 * Math.pow(2, (3 + voice.frequency) / 12 + (this._octave - 5))) / this._oscStructure[voice.oscName]._params._wavetype, 48000, {
                                fadeStart: 20000,
                                fadeEnd: 24000,
                                maxPartials: 1024,
                                relThreshold: 1e-6
                            });
                        }
                    }
                    break;
                case "getOscStructure":
                    this.port.postMessage({ type: "givenOscStructure", data: this._oscStructure});
                    break;
                case "startRecording":
                    this._isRecording = true;
                    this._recordArray = [];
                    this._recordingMaxAmp = 1;
                    break;
                case "stopRecording":
                    this._isRecording = false;
                    this.port.postMessage({ type: "recordedAudio", data: this._recordArray, maxAmp: this._recordingMaxAmp });
                    break;
            }
        }

        this._oscStructure = {};
        this._selectedOsc = "";
        this._voices = [];
        this._octave = 5;
        this._isRecording = false;
        this._recordArray = [];
        this._recordingMaxAmp = 1;
    }

    process(inputList, outputList, parameters) {
        const output = outputList[0][0];

        if (Object.keys(this._oscStructure).length > 0) {
            for (let sample = 0; sample < output.length; sample++) {
                let currentVal = 0;
                for (let voice of this._voices) {
                    const osc = this._oscStructure[voice.oscName];
                    const frequency = (440 * Math.pow(2, (3 + voice.frequency) / 12 + (this._octave - 5))) / osc._params._wavetype;
                    if (!this._additiveSynthesis) {
                        let idx = voice.phase % 48000;
                        if (idx < 0) idx += 48000;
                        const i0 = Math.floor(idx);
                        const i1 = Math.ceil(idx) % 48000;
                        const frac = idx - i0;
                        const a = osc.oscillatorSamples[i0];
                        const b = osc.oscillatorSamples[i1];
                        currentVal += lerp(a, b, frac) * voice.velocity * smooth((voice.sampleCounter + 1) / 512);
                        voice.phase = idx + frequency;
                        if (voice.phase >= Number.MAX_SAFE_INTEGER - 1e6) {
                            voice.phase = (voice.phase % 48000) + 48000;
                        }
                        if (!voice || typeof voice.phase !== 'number') continue;
                        voice.phase = ((voice.phase % 48000) + 48000) % 48000;
                    } else {
                        let preMixCurrentVal = 0;
                        const N = voice._partialCount;
                        const amps = voice._amps, phX = voice._phX, phY = voice._phY, cI = voice._cosInc, sI = voice._sinInc;
                        for (let k = 0; k < N; k++) {
                            preMixCurrentVal += amps[k] * phY[k];
                            const x = phX[k], y = phY[k];
                            phX[k] = x * cI[k] - y * sI[k];
                            phY[k] = x * sI[k] + y * cI[k];
                        }
                        if (Math.abs(preMixCurrentVal) > voice.freeRunMaxVal) voice.freeRunMaxVal = Math.abs(preMixCurrentVal);
                        currentVal += preMixCurrentVal / voice.freeRunMaxVal * voice.velocity * smooth((voice.sampleCounter + 1) / this._declickSampleTime);
                    }

                    if (voice.removing == false) voice.sampleCounter++;
                    else voice.sampleCounter--;

                    if (voice.sampleCounter < 0) {
                        const index = this._voices.indexOf(voice);
                        if (index > -1) {
                            this._voices.splice(index, 1);
                        }
                    }
                }
                
                output[sample] = currentVal;
                if (this._isRecording) {
                    this._recordArray.push(currentVal);
                    if (Math.abs(currentVal) > this._recordingMaxAmp) this._recordingMaxAmp = Math.abs(currentVal);
                }
            }
        }

        return true;
    }
}

registerProcessor("uo-synth", UOSynth);

const antiAliasingFilterCoeffs = designLowpassFIR(48000, 20000, 401);

const lerp = (a, b, t) => a + (b - a) * t;

function epsilon(x) {
    const exponent = Math.floor(Math.log2(Math.abs(x))) + 1;
    
    return 2 ** (exponent - 53)
}

const smooth = (x) => {
    const psi = (t) => {
        if (t <= 0) return 0;
        else if (t > 0) return Math.E ** (-1 / t);
    }
    
    return psi(x) / (psi(x) + psi(1 - x));
}

function decToFrac(value, tolerance = 1e-6) {
    if (value === parseInt(value)) {
        return { numerator: value, denominator: 1 };
    }

    let h1 = 1, h2 = 0;
    let k1 = 0, k2 = 1;
    let negative = false;

    if (value < 0) {
        negative = true;
        value = -value;
    }

    let integerPart = Math.floor(value);
    value -= integerPart;

    let b = value;
    do {
        let a = Math.floor(b);
        let aux_h = h1;
        let aux_k = k1;
        h1 = a * h1 + h2;
        k1 = a * k1 + k2;
        h2 = aux_h;
        k2 = aux_k;
        b = 1 / (b - a);
    } while (Math.abs(value - h1 / k1) > value * tolerance);

    let finalNumerator = negative ? -(h1 + integerPart * k1) : (h1 + integerPart * k1);
    return { numerator: finalNumerator, denominator: k1 };
}

function combinePartialsInteger(A, B) {
    if (!A || !B) return { frequencies: [], amplitudes: [], phases: [] };

    const Af = A.frequencies || [], Aa = A.amplitudes || [], Ap = A.phases || [];
    const Bf = B.frequencies || [], Ba = B.amplitudes || [], Bp = B.phases || [];

    const AL = Af.length | 0;
    const BL = Bf.length | 0;
    if (AL === 0 || BL === 0) return { frequencies: [], amplitudes: [], phases: [] };

    const map = new Map();

    for (let i = 0; i < AL; i++) {
        const a_h = Math.round(+Af[i]);
        const a_amp = +Aa[i] || 0;
        const a_ph = +Ap[i] || 0;
        if (!Number.isFinite(a_h) || !Number.isFinite(a_amp) || a_amp == 0 || !Number.isFinite(a_ph)) continue;

        for (let j = 0; j < BL; j++) {
            const b_h = Math.round(+Bf[j]);
            const b_amp = +Ba[j] || 0;
            const b_ph = +Bp[j] || 0;
            if (!Number.isFinite(b_h) || !Number.isFinite(b_amp) || b_amp == 0 || !Number.isFinite(b_ph)) continue;

            const h = a_h * b_h;
            if (!Number.isFinite(h) || h <= 0) continue;

            const contribAmp = a_amp * b_amp;
            const contribPhase = a_ph + b_ph;

            const c = Math.cos(contribPhase) * contribAmp;
            const s = Math.sin(contribPhase) * contribAmp;

            const key = String(h);
            const prev = map.get(key);
            if (prev) {
                prev.real += c;
                prev.imag += s;
            } else {
                map.set(key, { h: h, real: c, imag: s });
            }
        }
    }

    const outEntries = Array.from(map.values());
    outEntries.sort((x, y) => x.h - y.h);

    const freqs = new Array(outEntries.length);
    const amps = new Array(outEntries.length);
    const phs = new Array(outEntries.length);

    for (let k = 0; k < outEntries.length; k++) {
        const e = outEntries[k];
        freqs[k] = e.h;
        amps[k]  = Math.hypot(e.real, e.imag);
        phs[k]   = Math.atan2(e.imag, e.real);
    }

    return { frequencies: freqs, amplitudes: amps, phases: phs };
}

function combinePartialsReal(A, B, opts = {}) {
    const keyPrecision = (typeof opts.keyPrecision === 'number') ? opts.keyPrecision : 15;

    if (!A || !B) return { frequencies: [], amplitudes: [], phases: [] };

    const Af = A.frequencies || [], Aa = A.amplitudes || [], Ap = A.phases || [];
    const Bf = B.frequencies || [], Ba = B.amplitudes || [], Bp = B.phases || [];

    const AL = Af.length | 0;
    const BL = Bf.length | 0;
    if (AL === 0 || BL === 0) return { frequencies: [], amplitudes: [], phases: [] };

    const map = new Map();

    for (let i = 0; i < AL; i++) {
        const a_f = +Af[i];
        const a_amp = +Aa[i] || 0;
        const a_ph = +Ap[i] || 0;
        if (!Number.isFinite(a_f) || !Number.isFinite(a_amp) || a_amp == 0 || !Number.isFinite(a_ph)) continue;

        for (let j = 0; j < BL; j++) {
            const b_f = +Bf[j];
            const b_amp = +Ba[j] || 0;
            const b_ph = +Bp[j] || 0;
            if (!Number.isFinite(b_f) || !Number.isFinite(b_amp) || b_amp == 0 || !Number.isFinite(b_ph)) continue;

            const r = a_f * b_f;
            if (!Number.isFinite(r)) continue;

            const contribAmp = a_amp * b_amp;
            const contribPhase = a_ph + b_ph;

            const key = r.toPrecision(keyPrecision);

            const c = Math.cos(contribPhase) * contribAmp;
            const s = Math.sin(contribPhase) * contribAmp;

            const prev = map.get(key);
            if (prev) {
                prev.real += c;
                prev.imag += s;
            } else {
                map.set(key, { r: r, real: c, imag: s });
            }
        }
    }

    const outEntries = Array.from(map.values());
    outEntries.sort((x, y) => x.r - y.r);

    const freqs = new Array(outEntries.length);
    const amps = new Array(outEntries.length);
    const phs = new Array(outEntries.length);

    for (let k = 0; k < outEntries.length; k++) {
        const e = outEntries[k];
        freqs[k] = e.r;
        amps[k]  = Math.hypot(e.real, e.imag);
        phs[k]   = Math.atan2(e.imag, e.real);
    }

    return { frequencies: freqs, amplitudes: amps, phases: phs };
}

function calcVoicePartials(voice, osc, fundamental, sampleRate, opts = {}) {
    const nyquist = sampleRate / 2;
    const t0 = opts.fadeStart || 20000;
    const t1 = opts.fadeEnd   || 24000;
    const maxPartials = opts.maxPartials || 256;
    const relThreshold = opts.relThreshold || 1e-6;

    const amps   = new Float32Array(maxPartials);
    const phX    = new Float32Array(maxPartials);
    const phY    = new Float32Array(maxPartials);
    const cosInc = new Float32Array(maxPartials);
    const sinInc = new Float32Array(maxPartials);
    let count = 0;

    let runningMaxAmp = 0;

    const partialCount = Math.min(osc._oscillatorPartialFreqs.length, osc._params._partialCount);

    for (let i = 0; i < partialCount; i++) {
        const ratio = osc._oscillatorPartialFreqs[i];
        if (!Number.isFinite(ratio)) continue;
        const baseFreq = ratio * fundamental;
        const partFreq = Math.abs(baseFreq);
        if (partFreq >= nyquist && ratio !== osc._params._wavetype) continue;

        let baseAmp = (osc._oscillatorPartialAmps[i] || 0);
        let ampSign = Math.sign(baseAmp) || 1;
        let amp = Math.abs(baseAmp);
        if (partFreq > t0) {
            const t = Math.min(1, (partFreq - t0) / (t1 - t0));
            amp *= 0.5 * (1 + Math.cos(Math.PI * t));
        }
        if (amp <= 0) continue;

        if (amp > runningMaxAmp) runningMaxAmp = amp;
        const threshold = runningMaxAmp * relThreshold;
        if (amp < threshold) continue;

        const phase = (osc._oscillatorPartialPhases[i] || 0) + (ampSign < 0 ? Math.PI : 0);
        const inc = 2 * Math.PI * baseFreq / sampleRate;
        const c = Math.cos(inc), s = Math.sin(inc);
        const px = Math.cos(phase), py = Math.sin(phase);

        if (count < maxPartials) {
            amps[count] = amp;
            phX[count] = px;
            phY[count] = py;
            cosInc[count] = c;
            sinInc[count] = s;
            count++;
            continue;
        }

        let minIdx = 0;
        let minAmp = amps[0];
        for (let j = 1; j < count; j++) {
            if (amps[j] < minAmp) { minAmp = amps[j]; minIdx = j; }
        }

        if (amp > minAmp) {
            amps[minIdx] = amp;
            phX[minIdx] = px;
            phY[minIdx] = py;
            cosInc[minIdx] = c;
            sinInc[minIdx] = s;
        }
    }

    if (count > 0) {
        let peak = 0;
        for (let i = 0; i < count; i++) {
            const a = amps[i];
            if (a > peak) peak = a;
        }

        if (peak > 0 && peak !== 1) {
            const inv = 1 / peak;
            for (let i = 0; i < count; i++) amps[i] *= inv;
        }
    }

    if (count < maxPartials) {
        voice._partialCount = count;
        voice._amps   = amps.subarray(0, count);
        voice._phX    = phX.subarray(0, count);
        voice._phY    = phY.subarray(0, count);
        voice._cosInc = cosInc.subarray(0, count);
        voice._sinInc = sinInc.subarray(0, count);
    } else {
        voice._partialCount = count;
        voice._amps   = amps;
        voice._phX    = phX;
        voice._phY    = phY;
        voice._cosInc = cosInc;
        voice._sinInc = sinInc;
    }
}

function sinc(x) {
    if (x === 0) return 1;
    return Math.sin(Math.PI * x) / (Math.PI * x);
}

function designLowpassFIR(sampleRate, cutoffHz, numTaps = 201) {
    if (numTaps % 2 === 0) numTaps++;
    const fc = cutoffHz / sampleRate;
    const M = (numTaps - 1) / 2;
    const coeffs = new Float32Array(numTaps);

    for (let n = 0; n < numTaps; n++) {
        const k = n - M;
        let h = 2 * fc * sinc(2 * fc * k);
        const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (numTaps - 1));
        coeffs[n] = h * w;
    }
    let sum = 0;
    for (let i = 0; i < coeffs.length; i++) sum += coeffs[i];
    for (let i = 0; i < coeffs.length; i++) coeffs[i] /= sum;

    return coeffs;
}

function applyFIRFilter(inputSamples, coeffs) {
    const N = inputSamples.length;
    const M = coeffs.length;
    const half = Math.floor(M / 2);
    const out = new Float32Array(N);

    for (let n = 0; n < N; n++) {
        let acc = 0;
        for (let k = 0; k < M; k++) {
        const i = n - k + half;
        if (i >= 0 && i < N) acc += inputSamples[i] * coeffs[k];
        }
        out[n] = acc;
    }
    return out;
}

"partial"