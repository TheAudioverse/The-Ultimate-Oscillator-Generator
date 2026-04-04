function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const clamp = (val, min, max) => {
    return Math.min(Math.max(val, min), max);
}

const smoothing = (x) => {
    return 2 ** (-((x / 4) ** 2));
}

//Creates audio context.
const synthCtx = new AudioContext({
  latencyHint: "interactive",
  sampleRate: 48000,
  sinkId: ''
});
let uoSynthNode
const oscAnalyser = synthCtx.createAnalyser();

const gainNode = synthCtx.createGain();
gainNode.gain.value = 0.5

const compressor = synthCtx.createDynamicsCompressor();
compressor.threshold.value = -30;
compressor.ratio.value = 20;
compressor.attack.value = 0.003;
compressor.release.value = 0.25;

const volumeControl = document.getElementsByName("synth-param-'amp'")[0];

volumeControl.addEventListener(
  "input",
  () => {
    gainNode.gain.value = volumeControl.value;
  },
  false,
)

function calcOscillatorPartials(osc, sampleRate, opts = {}) {
    const maxPartials = opts.maxPartials || 256;

    const amps   = new Float32Array(maxPartials);
    const phX    = new Float32Array(maxPartials);
    const phY    = new Float32Array(maxPartials);
    const cosInc = new Float32Array(maxPartials);
    const sinInc = new Float32Array(maxPartials);
    let count = 0;

    const partialCount = Math.min(osc.frequencies.length, maxPartials);

    for (let i = 0; i < partialCount; i++) {
        const ratio = osc.frequencies[i];
        if (!Number.isFinite(ratio)) continue;

        let baseAmp = (osc.amplitudes[i] || 0);
        let ampSign = Math.sign(baseAmp) || 1;
        let amp = Math.abs(baseAmp);
        if (amp == 0) continue;

        const phase = (osc.phases[i] || 0) + (ampSign < 0 ? Math.PI : 0);
        const inc = 2 * Math.PI * ratio / sampleRate;
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
        let sumSq = 0;
        for (let i = 0; i < count; i++) {
            const a = amps[i];
            if (!Number.isFinite(a)) {
                amps[i] = 0;
                continue;
            }
            sumSq += a * a;
        }
        const norm = Math.sqrt(sumSq);
        if (norm > 0 && norm !== 1) {
            const inv = 1 / norm;
            for (let i = 0; i < count; i++) amps[i] *= inv;
        }
    }

    if (count < maxPartials) {
        return {
            partialCount: count,
            amps: amps.subarray(0, count),
            phX: phX.subarray(0, count),
            phY: phY.subarray(0, count),
            cosInc: cosInc.subarray(0, count),
            sinInc: sinInc.subarray(0, count)
        }
    } else {
        return {
            partialCount: count,
            amps: amps,
            phX: phX,
            phY: phY,
            cosInc: cosInc,
            sinInc: sinInc
        }
    }
}

async function setupUOSynth(attempts) {
    if (attempts < 5) {
        try {
            await synthCtx.audioWorklet.addModule('The Ultimate Oscillator Generator/synth.js');
            console.log('Audio worklet module loaded.');
            uoSynthNode = new AudioWorkletNode(synthCtx, 'uo-synth');
            uoSynthNode.connect(gainNode).connect(compressor).connect(oscAnalyser).connect(synthCtx.destination);
        } catch (err) {
            console.error('Error setting up audio worklet:', err, ' retrying...');
            await wait(1000);
            setupUOSynth(attempts + 1);
        }
    } else {
        alert('Failed to set up audio worklet after multiple attempts. Try reloading the page.');
    }
}

window.addEventListener('pointerdown', () => {
    if (synthCtx.state === 'suspended') {
        synthCtx.resume();
    }
});

setupUOSynth(0).then(async () => {
    let selectedOscName = '';
    let fractalSynthesis = false;
    let oscStructure = null;
    let oscillatorSamplesArray = null;
    let oscillatorMaxAmp = 1;
    let visualSampleCount = 400;
    let visualOscRAF;
    let drawOscVisualVersion = 0;
    let visualOscDrawType = "oscilloscope";
    let visualOscScalar = 125;

    const e = Math.E;
    const π = Math.PI;
    const pi = Math.PI;
    const gr = (1 + Math.sqrt(5)) / 2;
    const phi = (1 + Math.sqrt(5)) / 2;
    const φ = (1 + Math.sqrt(5)) / 2;
    
    const synthParamsInputHTMLforUOSynth = [
        document.getElementsByName(`synth-param-'amp'`)[0],
        document.getElementsByName(`synth-param-'partials'`)[0],
        document.getElementsByName(`synth-param-'damping'`)[0],
        document.getElementsByName(`synth-param-'wavetype'`)[0],
        document.getElementsByName(`synth-param-'shift'`)[0],
        document.getElementsByName(`synth-param-'pull'`)[0],
        document.getElementsByName(`synth-param-'partialFrequencyInverter'`)[0],
        document.getElementsByName(`synth-param-'partialComb'`)[0],
        document.getElementsByName(`synth-param-'partialPhaseShift'`)[0],
        document.getElementsByName(`synth-param-'pwmMix'`)[0],
        document.getElementsByName(`synth-param-'pwmPhase'`)[0],
        document.getElementsByName(`synth-param-'flangingPhase'`)[0],
    ];

    uoSynthNode.port.onmessage = async (event) => {
        console.log('Message from worklet:', event.data);

        switch (event.data.type) {
            case "error":
                console.log(event.data.message);
                alert(event.data.message);
                break;
            case "alert":
                alert(event.data.message);
                break;
            case "Load Oscillator":
                synthParamsInputHTMLforUOSynth[1].value = event.data.parameters._partialCount;
                synthParamsInputHTMLforUOSynth[2].value = event.data.parameters._damping;
                synthParamsInputHTMLforUOSynth[3].value = event.data.parameters._wavetype;
                synthParamsInputHTMLforUOSynth[4].value = event.data.parameters._shift;
                synthParamsInputHTMLforUOSynth[5].value = event.data.parameters._pull;
                synthParamsInputHTMLforUOSynth[6].value = event.data.parameters._partialFrequencyInverter;
                synthParamsInputHTMLforUOSynth[7].value = event.data.parameters._partialComb;
                synthParamsInputHTMLforUOSynth[8].value = event.data.parameters._partialPhaseShifter;
                synthParamsInputHTMLforUOSynth[9].value = event.data.parameters._pwmMix;
                synthParamsInputHTMLforUOSynth[10].value = event.data.parameters._pwmPhase;
                synthParamsInputHTMLforUOSynth[11].value = event.data.parameters._flangingPhase;
                selectedOscName = event.data.oscName;
                break;
            case "updateSelectedOsc":
                selectedOscName = event.data.oscName;
                break;
            case "Busy":
                if (event.data.subtype === "synthesizing...") {
                    const synthesizeBtn = document.getElementById("save-preset-btn");
                    synthesizeBtn.disabled = true;
                    synthesizeBtn.setAttribute('aria-disabled', 'true');
                    synthesizeBtn.innerText = 'Synthesizing... Please wait.';
                    synthesizeBtn.style.cursor = 'not-allowed';
                    if (document.getElementById("save-preset-btn-2")) {
                        const fractalSynthesizeBtn = document.getElementById("save-preset-btn-2");
                        fractalSynthesizeBtn.disabled = true;
                        fractalSynthesizeBtn.setAttribute('aria-disabled', 'true');
                        fractalSynthesizeBtn.innerText = 'Synthesizing... Please wait.';
                        fractalSynthesizeBtn.style.cursor = 'not-allowed';
                    }
                }
                break;
            case "Done":
                if (event.data.subtype === "synthesizing...") {
                    const synthesizeBtn = document.getElementById("save-preset-btn");
                    synthesizeBtn.disabled = false;
                    synthesizeBtn.setAttribute('aria-disabled', 'false');
                    synthesizeBtn.innerText = 'Synthesize & Save Preset';
                    synthesizeBtn.style.cursor = 'pointer';
                    if (document.getElementById("save-preset-btn-2")) {
                        const fractalSynthesizeBtn = document.getElementById("save-preset-btn-2");
                        fractalSynthesizeBtn.disabled = false;
                        fractalSynthesizeBtn.setAttribute('aria-disabled', 'false');
                        fractalSynthesizeBtn.innerText = 'Fractalize & Save Preset';
                        fractalSynthesizeBtn.style.cursor = 'pointer';
                    }
                }
                break;
            case "givenOscillator":
                const oscillator = event.data.oscillator;
                oscillatorSamplesArray = oscillator._oscillatorSamples;
                oscillatorMaxAmp = oscillator._oscillatorMaxAmp || 1;
                let oscilltorPhazorInfo = undefined;
                oscilltorPhazorInfo = calcOscillatorPartials({
                    frequencies: oscillator._oscillatorPartialFreqs, 
                    amplitudes: oscillator._oscillatorPartialAmps, 
                    phases: oscillator._oscillatorPartialPhases
                }, visualSampleCount, {
                    maxPartials: oscillator._params._partialCount
                });

                drawOscVisualVersion++;
                cancelAnimationFrame(visualOscRAF);
                visualOscRAF = undefined;

                oscCtx.fillStyle = "rgb(24, 24, 26)";
                oscCtx.fillRect(0, 0, oscCvs.width, oscCvs.height);
                oscCtx.strokeStyle = "rgb(0, 185, 185)";
                oscCtx.lineWidth = 1;
                
                const N = oscilltorPhazorInfo.partialCount;

                let x;
                let y;
                let yArray = [];
                let prevX = 0;
                let prevY = oscCvs.height / 2;
                let prevYArray = [];
                prevYArray.fill(oscCvs.height / 2, 0, N - 1);
                for (let i = 0; i < visualSampleCount; i++) {
                    let currentVal = 0;
                    x = (i / visualSampleCount * oscCvs.width);
                    const amps = oscilltorPhazorInfo.amps, phX = oscilltorPhazorInfo.phX, phY = oscilltorPhazorInfo.phY, cI = oscilltorPhazorInfo.cosInc, sI = oscilltorPhazorInfo.sinInc;
                    if (visualOscDrawType == "oscilloscope") {
                        for (let k = 0; k < N; k++) {
                            currentVal += amps[k] * phY[k];
                            const xP = phX[k], yP = phY[k];
                            phX[k] = xP * cI[k] - yP * sI[k];
                            phY[k] = xP * sI[k] + yP * cI[k];
                        }

                        y = clamp(currentVal / oscillatorMaxAmp * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
                        oscCtx.beginPath();
                        oscCtx.moveTo(prevX, prevY);
                        oscCtx.lineTo(x, y);
                        oscCtx.stroke();

                        prevY = y;
                    } else if (visualOscDrawType == "fourierOscilloscope") {
                        for (let k = 0; k < N; k++) {
                            currentVal = amps[k] / amps[0] * phY[k];
                            const xP = phX[k], yP = phY[k];
                            phX[k] = xP * cI[k] - yP * sI[k];
                            phY[k] = xP * sI[k] + yP * cI[k];

                            yArray[k] = clamp(currentVal / oscillatorMaxAmp * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
                            oscCtx.beginPath();
                            oscCtx.moveTo(prevX, prevYArray[k]);
                            oscCtx.lineTo(x, yArray[k]);
                            oscCtx.stroke();
                        }

                        prevYArray = yArray.map(v => v);
                    }

                    prevX = x;
                };

                const currentVersion = drawOscVisualVersion;
                const drawOscVisual = () => {
                    if (currentVersion != drawOscVisualVersion) return;
                    visualOscRAF = requestAnimationFrame(drawOscVisual);
                    
                    if (visualOscDrawType != "paused") {
                        const img = oscCtx.getImageData(1, 0, oscCvs.width - 1, oscCvs.height);
                        oscCtx.putImageData(img, 0, 0);
                        oscCtx.clearRect(oscCvs.width - 1, 0, 1, oscCvs.height);
                    }

                    let currentVal = 0;
                    const N = oscilltorPhazorInfo.partialCount;
                    const amps = oscilltorPhazorInfo.amps, phX = oscilltorPhazorInfo.phX, phY = oscilltorPhazorInfo.phY, cI = oscilltorPhazorInfo.cosInc, sI = oscilltorPhazorInfo.sinInc;
                    if (visualOscDrawType == "oscilloscope") {
                        for (let k = 0; k < N; k++) {
                            currentVal += amps[k] * phY[k];
                            const xP = phX[k], yP = phY[k];
                            phX[k] = xP * cI[k] - yP * sI[k];
                            phY[k] = xP * sI[k] + yP * cI[k];
                        }

                        const yVal = clamp(currentVal / oscillatorMaxAmp * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
                        oscCtx.beginPath();
                        oscCtx.moveTo(oscCvs.width - 2, prevY);
                        oscCtx.lineTo(oscCvs.width - 1, yVal);
                        oscCtx.stroke();

                        prevY = yVal;
                    } else if (visualOscDrawType == "fourierOscilloscope") {
                        for (let k = 0; k < N; k++) {
                            currentVal = amps[k] / amps[0] * phY[k];
                            const xP = phX[k], yP = phY[k];
                            phX[k] = xP * cI[k] - yP * sI[k];
                            phY[k] = xP * sI[k] + yP * cI[k];

                            yArray[k] = clamp(currentVal / oscillatorMaxAmp * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
                            oscCtx.beginPath();
                            oscCtx.moveTo(oscCvs.width - 2, prevYArray[k]);
                            oscCtx.lineTo(oscCvs.width - 1, yArray[k]);
                            oscCtx.stroke();
                        }

                        prevYArray = yArray.map(v => v);
                    }
                }

                await wait(2000);

                drawOscVisual();
                break;
            case "recordedAudio":
                const recordedAudio = event.data.data;
                const maxAmp = event.data.maxAmp || 1;
                downloadWAV(recordedAudio, maxAmp, "recording");
                break;
        }
    };

    const messageFunctions = Object.freeze({
        createOsc: (oscName) => {
            uoSynthNode.port.postMessage({
                type: "createOsc",
                oscName: oscName,
            });
        },
        deleteOsc: (oscName) => {
            uoSynthNode.port.postMessage({
                type: "deleteOsc",
                oscName: oscName
            });
        },
        selectOsc: (oscName) => {
            uoSynthNode.port.postMessage({
                type: "selectOsc",
                oscName: oscName
            });
        },
        synthesize: (_elseOsc) => {
            uoSynthNode.port.postMessage({
                type: "synthesize",
                parameters: {
                    "_partialCount": Number(synthParamsInputHTMLforUOSynth[1].value),
                    "_damping": eval(synthParamsInputHTMLforUOSynth[2].value),
                    "_wavetype": eval(synthParamsInputHTMLforUOSynth[3].value),
                    "_shift": eval(synthParamsInputHTMLforUOSynth[4].value),
                    "_pull": eval(synthParamsInputHTMLforUOSynth[5].value),
                    "_partialFrequencyInverter": eval(synthParamsInputHTMLforUOSynth[6].value),
                    "_partialComb": eval(synthParamsInputHTMLforUOSynth[7].value),
                    "_partialPhaseShifter": eval(synthParamsInputHTMLforUOSynth[8].value),
                    "_pwmMix": eval(synthParamsInputHTMLforUOSynth[9].value),
                    "_pwmPhase": eval(synthParamsInputHTMLforUOSynth[10].value),
                    "_flangingPhase": eval(synthParamsInputHTMLforUOSynth[11].value),
                    "_isFractal": _elseOsc != null ? true : false
                },
                elseOsc: _elseOsc
            });
        },
        renameOsc: (pscName, newOscName) => {
            uoSynthNode.port.postMessage({
                type: "renameOsc",
                oscName: pscName,
                newOscName: newOscName
            })
        },
        loadSession: (sessionData) => {
            uoSynthNode.port.postMessage({
                type: "loadSession",
                sessionData: sessionData
            });
        },
        addVoice: (oscName, frequency, velocity) => {
            uoSynthNode.port.postMessage({
                type: "addVoice",
                oscName: oscName,
                frequency: frequency,
                velocity: velocity
            });
        },
        removeVoice: (oscName, frequency) => {
            uoSynthNode.port.postMessage({
                type: "removeVoice",
                oscName: oscName,
                frequency: frequency
            });
        },
        changeOctave: (newOctave) => {
            uoSynthNode.port.postMessage({
                type: "changeOctave",
                octave: newOctave
            });
        },
        setOctave: (newOctave) => {
            uoSynthNode.port.postMessage({
                type: "setOctave",
                octave: newOctave
            });
        }
    });

    uoSynthNode.port.postMessage({ type: 'testing' });

    const synthesisMessageHandler = (event) => {
        const synthName = document.getElementsByName('synth-name-input')[0].value;
        
        if (event.data.type === 'givenOscStructure') {
            oscStructure = event.data.data;
            try { uoSynthNode.port.removeEventListener('message', synthesisMessageHandler, { once: true }); } catch (e) {}
        }
    
        console.log('oscStructure loaded:', oscStructure);
        if (!(synthName in oscStructure)) {
            messageFunctions.createOsc(synthName);
        }

        if (fractalSynthesis) {
            const argTextBox = document.getElementsByClassName('fractalize-arg-text-box')[0];
            messageFunctions.synthesize(argTextBox.value);

            const fractalize = document.createElement('button');
            fractalize.id = 'save-preset-btn-2';
            fractalize.classList.add('save-preset-btn-2');
            fractalize.innerText = 'Fractalize & Save Preset';

            argTextBox.replaceWith(fractalize);

            fractalSynthesis = false;
            try { uoSynthNode.port.removeEventListener('message', synthesisMessageHandler, { once: true }); } catch (e) {}
            return;
        } else {
            try { uoSynthNode.port.removeEventListener('message', synthesisMessageHandler, { once: true }); } catch (e) {}
            return messageFunctions.synthesize(null);
        }
    };

    document.getElementById("save-preset-btn").addEventListener("click", async () => {
        oscStructure = null;
        
        uoSynthNode.port.addEventListener('message', synthesisMessageHandler, { once: true });
        uoSynthNode.port.postMessage({ type: 'getOscStructure' });
    });

    document.getElementsByClassName("synthesize-btn-container")[0].addEventListener("click", (event) => {
        if (event.target.matches('#save-preset-btn-2')) {
            fractalSynthesis = true;
            const fractalize = document.getElementById('save-preset-btn-2');

            const argTextBox = document.createElement('input');
            argTextBox.classList.add('fractalize-arg-text-box');
            argTextBox.setAttribute('type', 'text');
            argTextBox.setAttribute('placeholder', 'Modulator Wave Name');

            fractalize.replaceWith(argTextBox);
        }
    });

    document.getElementById("load-osc-btn").addEventListener("click", async () => {
        const oscName = document.getElementsByName('synth-name-input')[0].value;
        uoSynthNode.port.postMessage({
            type: "selectOsc",
            oscName: oscName
        });
    });

    document.getElementById("visualOscDrawType").addEventListener('change', (event) => {
        visualOscDrawType = event.target.value;
    });

    function setVoice(action, freq, velocity = 1) {
        if (action === 'add') {
            messageFunctions.addVoice(selectedOscName, freq, velocity);
            if (freq >= -12 && freq <= 20) {
                const keyboardbtn = document.getElementById(freq);
                if (keyboardbtn.className === "keybtn-type-2") {
                    keyboardbtn.style.color = 'rgb(0, 255, 255)';
                    keyboardbtn.style.backgroundColor = 'rgb(64, 64, 80)';
                } else {
                    keyboardbtn.style.backgroundColor = 'rgb(0, 255, 255)';
                };
                keyboardbtn.style.borderRadius = '1px';
            }
        } else if (action === 'remove') {
            messageFunctions.removeVoice(selectedOscName, freq, velocity);
            if (freq >= -12 && freq <= 20) {
                const keyboardbtn = document.getElementById(freq);
                if (keyboardbtn.className == "keybtn-type-2") {
                    keyboardbtn.style.color = 'rgb(0, 185, 185)';
                    keyboardbtn.style.backgroundColor = 'rgb(24, 24, 26)';
                } else {
                    keyboardbtn.style.backgroundColor = 'rgb(0, 185, 185)';
                };
                keyboardbtn.style.borderRadius = '2px';
            }
        }
    }

    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);

    function onMIDISuccess(midiAccess) {
        console.log("MIDI access successful", midiAccess);

        for (let input of midiAccess.inputs.values()) {
            input.onmidimessage = getMIDIMessage;
        }

        midiAccess.onstatechange = (event) => {
            console.log(`MIDI device ${event.port.name} (${event.port.manufacturer}) ${event.port.state}`);
            for (let input of midiAccess.inputs.values()) {
                input.onmidimessage = getMIDIMessage;
            }
        };
    }

    function getMIDIMessage(message) {
        const [command, note, velocity] = message.data;
        
        if (command === 144 && velocity > 0) {
            console.log(`Note On: ${note} (Velocity: ${velocity})`);
            setVoice("add", note - 60, velocity / 128);
        } else if (command === 128 || (command === 144 && velocity === 0)) {
            console.log(`Note Off: ${note}`);
            setVoice("remove", note - 60, velocity / 128);
        }
    }

    function onMIDIFailure(msg) {
        console.error(`Failed to get MIDI access - ${msg}`);
    }

    let pointerPitch;

    document.getElementsByClassName('keyboard-buttons-container')[0].addEventListener('pointerdown', (event) => {
        pointerPitch = Number(event.target.id)
        setVoice("add", pointerPitch);
    });

    document.getElementsByClassName('keyboard-buttons-container')[0].addEventListener('pointerup', () => {
        setVoice("remove", pointerPitch);
    });

    document.getElementsByClassName('keyboard-buttons-container')[0].addEventListener('pointercancel', () => {
        setVoice("remove", pointerPitch);
    });

    document.addEventListener('keydown', (event) => {
        if (event.repeat || document.activeElement.tagName == 'INPUT' && document.activeElement.type == 'text') return;
        switch (event.key) {
            case "`":
                setVoice("add", -2);
                break;
            case "q":
                setVoice("add", 0);
                break;
            case "2":
                setVoice("add", 1);
                break;
            case "w":
                setVoice("add", 2);
                break;
            case "3":
                setVoice("add", 3);
                break;
            case "e":
                setVoice("add", 4);
                break;
            case "r":
                setVoice("add", 5);
                break;
            case "5":
                setVoice("add", 6);
                break;
            case "t":
                setVoice("add", 7);
                break;
            case "6":
                setVoice("add", 8);
                break;
            case "y":
                setVoice("add", 9);
                break;
            case "7":
                setVoice("add", 10);
                break;
            case "u":
                setVoice("add", 11);
                break;
            case "i":
                setVoice("add", 12);
                break;
            case "9":
                setVoice("add", 13);
                break;
            case "o":
                setVoice("add", 14);
                break;
            case "0":
                setVoice("add", 15);
                break;
            case "p":
                setVoice("add", 16);
                break;
            case "[":
                setVoice("add", 17);
                break;
            case "=":
                setVoice("add", 18);
                break;
            case "]":
                setVoice("add", 19);
                break;
            case "Backspace":
                setVoice("add", 20);
                break;
            case `\\`:
                setVoice("add", 21);
                break;
            case "z":
                setVoice("add", -12);
                break;
            case "s":
                setVoice("add", -11);
                break;
            case "x":
                setVoice("add", -10);
                break;
            case "d":
                setVoice("add", -9);
                break;
            case "c":
                setVoice("add", -8);
                break;
            case "v":
                setVoice("add", -7);
                break;
            case "g":
                setVoice("add", -6);
                break;
            case "b":
                setVoice("add", -5);
                break;
            case "h":
                setVoice("add", -4);
                break;
            case "n":
                setVoice("add", -3);
                break;
            case "j":
                setVoice("add", -2);
                break;
            case "m":
                setVoice("add", -1);
                break;
            case ",":
                setVoice("add", 0);
                break;
            case "l":
                setVoice("add", 1);
                break;
            case ".":
                setVoice("add", 2);
                break;
            case ";":
                setVoice("add", 3);
                break;
            case "/":
                setVoice("add", 4);
                break;
            case "Enter":
                synthIdx = Number(document.getElementsByName(`synth-index-input`)[0].value);    
                return synthesize();
        };
    });

    document.addEventListener('keyup', (event) => {
        if (document.activeElement.tagName == 'INPUT' && document.activeElement.type == 'text') return;
        switch (event.key) {
            case "`":
                setVoice("remove", -2);
                break;
            case "q":
                setVoice("remove", 0);
                break;
            case "2":
                setVoice("remove", 1);
                break;
            case "w":
                setVoice("remove", 2);
                break;
            case "3":
                setVoice("remove", 3);
                break;
            case "e":
                setVoice("remove", 4);
                break;
            case "r":
                setVoice("remove", 5);
                break;
            case "5":
                setVoice("remove", 6);
                break;
            case "t":
                setVoice("remove", 7);
                break;
            case "6":
                setVoice("remove", 8);
                break;
            case "y":
                setVoice("remove", 9);
                break;
            case "7":
                setVoice("remove", 10);
                break;
            case "u":
                setVoice("remove", 11);
                break;
            case "i":
                setVoice("remove", 12);
                break;
            case "9":
                setVoice("remove", 13);
                break;
            case "o":
                setVoice("remove", 14);
                break;
            case "0":
                setVoice("remove", 15);
                break;
            case "p":
                setVoice("remove", 16);
                break;
            case "[":
                setVoice("remove", 17);
                break;
            case "=":
                setVoice("remove", 18);
                break;
            case "]":
                setVoice("remove", 19);
                break;
            case "Backspace":
                setVoice("remove", 20);
                break;
            case "\\":
                setVoice("remove", 21);
                break;
            case "z":
                setVoice("remove", -12);
                break;
            case "s":
                setVoice("remove", -11);
                break;
            case "x":
                setVoice("remove", -10);
                break;
            case "d":
                setVoice("remove", -9);
                break;
            case "c":
                setVoice("remove", -8);
                break;
            case "v":
                setVoice("remove", -7);
                break;
            case "g":
                setVoice("remove", -6);
                break;
            case "b":
                setVoice("remove", -5);
                break;
            case "h":
                setVoice("remove", -4);
                break;
            case "n":
                setVoice("remove", -3);
                break;
            case "j":
                setVoice("remove", -2);
                break;
            case "m":
                setVoice("remove", -1);
                break;
            case ",":
                setVoice("remove", 0);
                break;
            case "l":
                setVoice("remove", 1);
                break;
            case ".":
                setVoice("remove", 2);
                break;
            case ";":
                setVoice("remove", 3);
                break;
            case "/":
                setVoice("remove", 4);
                break;
            case "ArrowDown":
                messageFunctions.changeOctave(-1);
                break;
            case "ArrowUp":
                messageFunctions.changeOctave(1);
                break;
            case "Shift":
                messageFunctions.setOctave(5);
                break;
        }
    });

    const downloadWAV = (data, maxAmp, fileType) => {
        const sampleRate = synthCtx.sampleRate;
        const durationSeconds = (data.length || 0) / sampleRate;
        const numChannels = 1;
        const bytesPerSample = 2 * numChannels;
        const bytesPerSecond = sampleRate * bytesPerSample;
        const dataLength = bytesPerSecond * durationSeconds;
        const headerLength = 44;
        const fileLength = dataLength + headerLength;
        const bufferData = new Uint8Array(fileLength);
        const dataView = new DataView(bufferData.buffer);
        const writer = createWriter(dataView);

        // HEADER
        writer.string("RIFF");
        // File Size
        writer.uint32(fileLength);
        writer.string("WAVE");

        writer.string("fmt ");
        writer.uint32(16);
        writer.uint16(1);
        writer.uint16(numChannels);
        writer.uint32(sampleRate);
        writer.uint32(bytesPerSecond);
        writer.uint16(bytesPerSample);
        writer.uint16(bytesPerSample * 8);
        writer.string("data");

        writer.uint32(dataLength);

        for (let i = 0; i < dataLength / 2; i++) {
            const val = data[i] / (maxAmp || 1);
            writer.pcm16s(val);
        }
        const waveBlob = new Blob([dataView.buffer], { type: 'application/octet-stream' });
        let waveBlobURL = URL.createObjectURL(waveBlob);
        const downloadLink = document.getElementById('Link');
        downloadLink.href = waveBlobURL;
        if (fileType == "oscillator") {
            const strigifiedParms = `${synthParamsInputHTMLforUOSynth[1].value}, ${synthParamsInputHTMLforUOSynth[2].value}, ${synthParamsInputHTMLforUOSynth[3].value}, ${synthParamsInputHTMLforUOSynth[4].value}, ${synthParamsInputHTMLforUOSynth[5].value}, ${synthParamsInputHTMLforUOSynth[6].value}, ${synthParamsInputHTMLforUOSynth[7].value}, ${synthParamsInputHTMLforUOSynth[8].value}, ${synthParamsInputHTMLforUOSynth[9].value}, ${synthParamsInputHTMLforUOSynth[10].value}, ${synthParamsInputHTMLforUOSynth[11].value}`;
            downloadLink.download = `${selectedOscName} (${strigifiedParms}).wav`;
        } else if (fileType == "recording") {
            downloadLink.download = `recording of ${selectedOscName}-${(new Date()).toISOString().replace(/[:.]/g,'-')}.wav`;
        }
        downloadLink.click();
        URL.revokeObjectURL(waveBlob);

        function createWriter(dataView) {
        let pos = 0;

        return {
                string(val) {
                    for (let i = 0; i < val.length; i++) {
                        dataView.setUint8(pos++, val.charCodeAt(i));
                    }
                },
                uint16(val) {
                    dataView.setUint16(pos, val, true);
                    pos += 2;
                },
                uint32(val) {
                    dataView.setUint32(pos, val, true);
                    pos += 4;
                },
                pcm16s: function(value) {
                    value = Math.round(value * 32768);
                    value = Math.max(-32768, Math.min(value, 32767));
                    dataView.setInt16(pos, value, true);
                    pos += 2;
                },
            }
        }
    }

    document.getElementById("export-wav-button").addEventListener("click", () => downloadWAV(oscillatorSamplesArray, oscillatorMaxAmp, "oscillator"));

    let isRecording = false;

    document.getElementById('record-wav-button').addEventListener('click', () => {
        if (!uoSynthNode) {
            alert("You can't record right now, try clicking somewhere..");
            return;
        }

        uoSynthNode.port.postMessage({ type: 'startRecording' });
        isRecording = true;
        const recordBtn = document.getElementById('record-wav-button');
        recordBtn.innerText = 'Recording...';
        recordBtn.style.backgroundColor = 'rgb(255, 0, 0)';

        recordBtn.addEventListener('click', () => {
            if (!isRecording) return;
            uoSynthNode.port.postMessage({ type: 'stopRecording' });
            isRecording = false;
            recordBtn.innerText = 'Record .wav';
            recordBtn.style.backgroundColor = 'rgb(24, 24, 26)';
        });
    });

    function buildSessionObject(oscStructure) {
        const session = {
            metadata: {
                generatedAt: (new Date()).toISOString(),
                sampleRate: synthCtx.sampleRate,
            },
            oscillators: {}
        };

        for (const [name, osc] of Object.entries(oscStructure || {})) {
            session.oscillators[name] = {
                _name: osc._name || name,
                _params: osc._params || {},
                _elseOscName: osc._elseOscName || null,
            };

            for (const [_key, value] of Object.entries(osc._arrayParams)) {
                session.oscillators[name]._params[_key] = value;
            }
        }

        return session;
    }

    function downloadJSON(obj, filename = 'uosc-session.json') {
        const text = JSON.stringify(obj, null, 2);
        const sessionBlob = new Blob([text], { type: 'application/json' });
        const sessionBlobUrl = URL.createObjectURL(sessionBlob);
        const downloadLink = document.getElementById('Link');
        downloadLink.href = sessionBlobUrl;
        downloadLink.download = filename;
        downloadLink.click();
        URL.revokeObjectURL(sessionBlobUrl);
    }

    function exportSessionJSON(filename = null) {
        if (!uoSynthNode) {
            alert('There is nothing to export... :(');
            return;
        }

        const msgId = Math.random().toString(36).slice(2);
        const onMsg = (ev) => {
            if (ev.data && ev.data.type === 'givenOscStructure') {
                try { uoSynthNode.port.removeEventListener('message', onMsg); } catch (e) {}
                const session = buildSessionObject(ev.data.data);
                downloadJSON(session, filename || `uosc-session-${(new Date()).toISOString().replace(/[:.]/g,'-')}.json`);
            }
        };
        uoSynthNode.port.addEventListener('message', onMsg);
        uoSynthNode.port.postMessage({ type: 'getOscStructure' });
    }

    document.getElementById("export-session-button").addEventListener("click", () => {
        exportSessionJSON();
    });

    document.getElementById("import-session-button").addEventListener("click", () => {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json';
        fileInput.click();
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = JSON.parse(e.target.result);
                console.log(data);
                if (data && data.oscillators) {
                    messageFunctions.loadSession(data.oscillators);
                }
            };
            reader.readAsText(file);
        });
    });

    document.getElementById('manage-session-button').addEventListener('click', () => {
        let manualDiv = document.getElementById('session-manager-popup-box');
        manualDiv.style.display = 'flex';

        const sessionManagerDisplayList = document.getElementById('session-manager-list');

        const onMsg = (ev) => {
            if (ev.data && ev.data.type === 'givenOscStructure') {
                try { uoSynthNode.port.removeEventListener('message', onMsg); } catch (e) {}
                Object.keys(ev.data.data || {}).forEach(name => {
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `<p style="width: 172px; margin-left: 8px;">${name}</p> <div style="min-width: 130px;"> <button class="session-manager-button" name="session-manager-rename-button">Rename</button> <button class="session-manager-button" name="session-manager-delete-button">Delete</button> </div>`;
                    listItem.classList.add('session-manager-list-item');
                    sessionManagerDisplayList.appendChild(listItem);
                });

                const sessionManagerFunction = (event) => {
                    const promptText = document.getElementById('prompt-text');
                    const promptDiv = document.getElementById('prompt-input-elements');
                    const oscName = event.target.parentElement.parentElement.innerText.replace('Rename', '').replace('Delete', '').trim();
                    const action = event.target.name === 'session-manager-rename-button' ? 'rename' : 'delete';
                    console.log(oscName, action);
                    if (action === 'delete') {
                        promptText.innerText = `Are you sure you want to delete "${oscName}"?`;
                        promptDiv.innerHTML = '<button id="session-manager-confirm-delete-button" class="session-manager-button" style="width: 80px;">Confirm</button> <button id="session-manager-cancel-delete-button" class="session-manager-button" style="width: 80px;">Cancel</button>';
                        document.getElementById('session-manager-confirm-delete-button').addEventListener('click', () => {
                            messageFunctions.deleteOsc(oscName);
                            event.target.parentElement.parentElement.remove();
                            promptText.innerText = 'Lorem ipsum ..';
                            promptDiv.innerHTML = '';
                        });
                        document.getElementById('session-manager-cancel-delete-button').addEventListener('click', () => {
                            promptText.innerText = 'Lorem ipsum ..';
                            promptDiv.innerHTML = '';
                        });
                    } else if (action === 'rename') {
                        promptText.innerText = `Rename "${oscName}" to...`;
                        promptDiv.innerHTML = '<input id="session-manager-new-name-input" class="synth-param-text-input" type="text" placeholder="New name" style="margin-right: 32px;"> <button id="session-manager-confirm-rename-button" class="session-manager-button">Rename</button> <button id="session-manager-cancel-rename-button" class="session-manager-button">Cancel</button>';
                        document.getElementById('session-manager-confirm-rename-button').addEventListener('click', () => {
                            const newName = document.getElementById('session-manager-new-name-input').value.trim();
                            messageFunctions.renameOsc(oscName, newName);
                            event.target.parentElement.parentElement.innerHTML = `<p style="width: 172px; margin-left: 8px;">${newName}</p> <div style="min-width: 130px;"> <button class="session-manager-button" name="session-manager-rename-button">Rename</button> <button class="session-manager-button" name="session-manager-delete-button">Delete</button> </div>`;
                            promptText.innerText = 'Lorem ipsum ..';
                            promptDiv.innerHTML = '';
                            for (let btn of smListItemButtons) {
                                btn.removeEventListener('click', sessionManagerFunction);
                                btn.addEventListener('click', sessionManagerFunction);
                            }
                        });
                        document.getElementById('session-manager-cancel-rename-button').addEventListener('click', () => {
                            promptText.innerText = 'Lorem ipsum ..';
                            promptDiv.innerHTML = '';
                        });
                    }
                };

                const smListItemButtons = document.getElementsByClassName('session-manager-button');

                for (let btn of smListItemButtons) {
                    btn.addEventListener('click', sessionManagerFunction);
                }
            }
        }
        uoSynthNode.port.addEventListener('message', onMsg);
        uoSynthNode.port.postMessage({ type: 'getOscStructure' });
    });
});

// ---------------------- //
// Visualization section. //
// ---------------------- //

let customWaveform = synthCtx.createPeriodicWave([0, 0], [0, 0]);
const oscCvs = document.getElementById("occiloscope-canvas");
const oscCtx = oscCvs.getContext("2d", { willReadFrequently: true });
oscCtx.imageSmoothingEnabled = false;

const graphCvs = document.getElementById("graph-canvas");
const graphCtx = graphCvs.getContext("2d");
graphCtx.lineWidth = 1;
graphCtx.strokeStyle = "rgb(0, 180, 180)";
graphCtx.fillStyle = "rgb(0, 0, 0)";
graphCtx.imageSmoothingEnabled = false;

oscAnalyser.fftSize = 4096;
oscAnalyser.smoothingTimeConstant = 0.8;
oscAnalyser.minDecibels = -90;
oscAnalyser.maxDecibels = 0;

const bufferLength = oscAnalyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

const pcmData = new Float32Array(oscAnalyser.fftSize);

let visualSelect = "oscilloscope";

document.getElementById("visualization-select").addEventListener("change", (event) => {
    visualSelect = event.target.value;
    visualizerSelecter();
});

const drawOsc = () => {
    if (visualSelect === "oscilloscope") requestAnimationFrame(drawOsc);
    oscAnalyser.getByteTimeDomainData(dataArray);
    
    graphCtx.clearRect(0, 0, graphCvs.width, graphCvs.height);
    graphCtx.fillStyle = "black";
    graphCtx.fillRect(0, 0, graphCvs.width, graphCvs.height);

    graphCtx.beginPath();

    const sliceWidth = (graphCvs.width / bufferLength);
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 256.0;
        const y = (v * graphCvs.height);

        if (i === 0) {
            graphCtx.moveTo(x, y);
        } else {
            graphCtx.lineTo(x, y);
        }

        x += sliceWidth;
    };

    graphCtx.lineTo(graphCvs.width, graphCvs.height / 2);
    graphCtx.stroke();
};

const drawHisto = () => {
    if (visualSelect == "histogram") requestAnimationFrame(drawHisto);
    oscAnalyser.getByteFrequencyData(dataArray);

    graphCtx.clearRect(0, 0, graphCvs.width, graphCvs.height);
    graphCtx.fillStyle = "black";
    graphCtx.fillRect(0, 0, graphCvs.width, graphCvs.height);
    
    function frequencyToAxis(frequency, minFreq, maxFreq, canvasDim) {
        const minLog = Math.log2(minFreq);
        const maxLog = Math.log2(maxFreq);
        const range = maxLog - minLog;
        let axis = ((Math.log2(frequency) - minLog) / range) * canvasDim * 1.7;
        return axis;
    };

    const barWidth = (graphCvs.width / bufferLength) * 4;
    let x = 0;

    graphCtx.beginPath();

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = dataArray[i] / 256 * graphCvs.height;

        graphCtx.lineTo(frequencyToAxis(x, 1, 24000, graphCvs.width), graphCvs.height - barHeight);

        x += barWidth / 4;
    };

    graphCtx.stroke();
}

let spectMap = null;
let spectColumn = null;
let spectCanvasHeight = 0;

function ensureSpectResources() {
    if (!spectMap || spectCanvasHeight !== graphCvs.height || !spectColumn) {
        spectCanvasHeight = graphCvs.height;
        spectMap = new Int32Array(bufferLength);
        const nyquist = synthCtx.sampleRate / 2;
        const minFreq = 20;
        const maxFreq = 24000;
        const minLog = Math.log2(minFreq);
        const maxLog = Math.log2(maxFreq);
        const logRange = maxLog - minLog;
        for (let i = 0; i < bufferLength; i++) {
            const freq = Math.max(minFreq, (i / (bufferLength - 1)) * nyquist);
            const logPos = (Math.log2(freq) - minLog) / logRange;
            let y = graphCvs.height - 1 - Math.floor(logPos * (graphCvs.height - 1));
            if (y < 0) y = 0;
            if (y >= graphCvs.height) y = graphCvs.height - 1;
            spectMap[i] = y;
        }

        spectColumn = graphCtx.createImageData(1, graphCvs.height);
        const d = spectColumn.data;
        for (let i = 0; i < d.length; i += 4) {
            d[i] = 0;
            d[i + 1] = 0;
            d[i + 2] = 0;
            d[i + 3] = 255;
        }
    }
}

const drawSpect = () => {
    if (visualSelect === "spectrogram") requestAnimationFrame(drawSpect);
    oscAnalyser.getByteFrequencyData(dataArray);
    ensureSpectResources();

    graphCtx.drawImage(graphCvs, -1, 0);

    const col = spectColumn.data;
    for (let i = 0; i < col.length; i += 4) {
        col[i] = 0;
        col[i + 1] = 0;
        col[i + 2] = 0;
        col[i + 3] = 255;
    }

    for (let bin = 0; bin < bufferLength; bin++) {
        const y = spectMap[bin];
        const intensity = dataArray[bin];
        const v = Math.min(180, Math.round(intensity * 180 / 255));
        const off = y * 4;
        if (col[off + 1] < v) col[off + 1] = v;
        if (col[off + 2] < v) col[off + 2] = v;
    }

    graphCtx.putImageData(spectColumn, graphCvs.width - 1, 0);
}

function visualizerSelecter() {
    if (visualSelect === "oscilloscope") {
        oscAnalyser.fftSize = 2048;
        graphCtx.clearRect(0, 0, graphCvs.width, graphCvs.height);
        graphCtx.fillRect(0, 0, graphCvs.width, graphCvs.height);
        oscAnalyser.getByteTimeDomainData(dataArray);
        drawOsc();
    } else if (visualSelect === "histogram") {
        oscAnalyser.fftSize = 8192;
        graphCtx.clearRect(0, 0, graphCvs.width, graphCvs.height);
        graphCtx.fillRect(0, 0, graphCvs.width, graphCvs.height);
        oscAnalyser.getByteFrequencyData(dataArray);
        oscAnalyser.smoothingTimeConstant = 0.8;
        drawHisto();
    } else if (visualSelect === "spectrogram") {
        oscAnalyser.fftSize = 8192;
        graphCtx.clearRect(0, 0, graphCvs.width, graphCvs.height);
        graphCtx.fillRect(0, 0, graphCvs.width, graphCvs.height);
        oscAnalyser.getByteFrequencyData(dataArray);
        oscAnalyser.smoothingTimeConstant = 0;
        drawSpect();
    }
}
visualizerSelecter();

// ------------------------------- //
// General event listener section. //
// ------------------------------- //

const synthParamsInputHTML = [
    document.getElementsByName(`synth-param-'amp'`)[0],
    document.getElementsByName(`synth-param-'partials'`)[0],
    document.getElementsByName(`synth-param-'damping'`)[0],
    document.getElementsByName(`synth-param-'wavetype'`)[0],
    document.getElementsByName(`synth-param-'shift'`)[0],
    document.getElementsByName(`synth-param-'pull'`)[0],
    document.getElementsByName(`synth-param-'partialFrequencyInverter'`)[0],
    document.getElementsByName(`synth-param-'partialComb'`)[0],
    document.getElementsByName(`synth-param-'partialPhaseShift'`)[0],
    document.getElementsByName(`synth-param-'pwmMix'`)[0],
    document.getElementsByName(`synth-param-'pwmPhase'`)[0],
    document.getElementsByName(`synth-param-'flangingPhase'`)[0],
];

document.getElementById('set-default-params-btn').addEventListener('click', () => {
    synthParamsInputHTML[0].value = "1";
    synthParamsInputHTML[1].value = "256";
    synthParamsInputHTML[2].value = "1";
    synthParamsInputHTML[3].value = "1";
    synthParamsInputHTML[4].value = "1";
    synthParamsInputHTML[5].value = "1";
    synthParamsInputHTML[6].value = "0";
    synthParamsInputHTML[7].value = "0";
    synthParamsInputHTML[8].value = "0";
    synthParamsInputHTML[9].value = "0";
    synthParamsInputHTML[10].value = "0";
    synthParamsInputHTML[11].value = "0";
    return
});

document.getElementById('the-manual-button').addEventListener('click', () => {
    let manualDiv = document.getElementById('manual-container');
    manualDiv.style.display = 'flex';
});

const closeButtons = document.getElementsByClassName('close-button');

for (let btn of closeButtons) {
    btn.addEventListener('click', () => {
        let div = btn.parentElement.parentElement;
        if (div.id === 'session-manager-popup-box') {
            const sessionManagerDisplayList = document.getElementById('session-manager-list');
            while (sessionManagerDisplayList.firstChild) {
                sessionManagerDisplayList.removeChild(sessionManagerDisplayList.firstChild);
            }
        }
        div.style.display = 'none';
    });
}