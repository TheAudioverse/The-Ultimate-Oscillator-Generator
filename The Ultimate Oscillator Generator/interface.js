function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const clamp = (val, min, max) => {
    return Math.min(Math.max(val, min), max);
}

const smoothing = (x) => {
    return 2 ** (-((x / 4) ** 2));
}

if (window.visualViewport.height < 600) {
    const infoParagraph = document.getElementsByClassName('info-paragraph')[0];
    infoParagraph.style.display = 'none';
}

window.addEventListener('resize', () => {
    if (window.visualViewport.height < 600) {
        const infoParagraph = document.getElementsByClassName('info-paragraph')[0];
        infoParagraph.style.display = 'none';
    }
});

const synthCtx = new AudioContext({
    latencyHint: "interactive",
    sampleRate: 48000,
    sinkId: ''
});
let uoSynthNode
const oscAnalyser = synthCtx.createAnalyser();

const gainNode = synthCtx.createGain();
gainNode.gain.value = 1;

const compressor = synthCtx.createDynamicsCompressor();
compressor.threshold.value = -30;
compressor.ratio.value = 20;
compressor.attack.value = 0.003;
compressor.release.value = 0.25;

const volumeControl = document.getElementsByName("synth-param-'amp'")[0];

volumeControl.addEventListener("input",
    () => gainNode.gain.value = volumeControl.value, 
    false
)

let showSequencer = false;
async function setupUOSynth(attempts) {
    if (attempts < 5) {
        try {
            await synthCtx.audioWorklet.addModule('The Ultimate Oscillator Generator/synth.js');
            console.log('Audio worklet module loaded.');
            uoSynthNode = new AudioWorkletNode(synthCtx, 'uo-synth');
            uoSynthNode.connect(compressor).connect(oscAnalyser).connect(gainNode).connect(synthCtx.destination);
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

function toHMS(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

setupUOSynth(0).then(async () => {
    const seqCvs = document.getElementById("sequencer-canvas");
    const seqCtx = seqCvs.getContext("2d", { willReadFrequently: true });
    
    let selectedOscName = '';
    let fractalSynthesis = false;
    let oscStructure = null;
    let oscillatorSamplesArray = null;
    let oscillatorMaxAmp = 1;
    let visualSampleCount = 400;
    let visualOscRAF;
    let drawOscVisualVersion = 0;
    let visualOscDrawType = "oscilloscope";
    let visualOscScalar = 75;
    let soundStructure = {};

    const e = Math.E;
    const π = Math.PI;
    const pi = Math.PI;
    const gr = (1 + Math.sqrt(5)) / 2;
    const phi = (1 + Math.sqrt(5)) / 2;
    const φ = (1 + Math.sqrt(5)) / 2;
    function repeatIntervalFunction(equalDivisons, octaveInterval, ...intervals) {
        let exponetialCoefficients = [0];
        let exponentialCoefficientsModEd = [0];
        let terminatingConditionArray = [];
        let sameIndexCounter = 0;
        let nextRepeatIndex = -1;
        let runLoop = true
        for (let i = 1; runLoop; i++) {
            exponetialCoefficients[i] = exponetialCoefficients[i-1] + intervals[(i-1) % intervals.length];
            exponentialCoefficientsModEd[i] = (exponentialCoefficientsModEd[i-1] + intervals[(i-1) % intervals.length]) % equalDivisons;
            if (i > 1 && exponentialCoefficientsModEd[i] == exponentialCoefficientsModEd[sameIndexCounter]) {
                nextRepeatIndex = nextRepeatIndex == -1 ? i - 1 : nextRepeatIndex
                terminatingConditionArray[sameIndexCounter] = exponentialCoefficientsModEd[sameIndexCounter];
                sameIndexCounter++
            } else {
                terminatingConditionArray = [0];
                sameIndexCounter = 0;
                nextRepeatIndex = -1;
            }

            if (nextRepeatIndex > 1 && terminatingConditionArray[terminatingConditionArray.length-1] == exponentialCoefficientsModEd[nextRepeatIndex]) {
                runLoop = false;
            }
        }

        outputArray = [];
        for (let k = 0; k < nextRepeatIndex+1; k++) {
            const kDivisor = k == 0 ? 1 : k;
            outputArray[k] = octaveInterval ** (exponetialCoefficients[k] / (kDivisor * equalDivisons))
        }

        return outputArray;
    }

    const songSettings = {
        bpm: 120,
        bpb: 4,
    };

    songSettings.beatLength = 60000 / songSettings.bpm;
    songSettings.barLength = songSettings.beatLength * songSettings.bpb;
    songSettings.timeStep = songSettings.beatLength / 24;

    const patternStructure = [];
    const patternArray = [];
    const noteArray = [];
    const clipboard = [];

    class Pattern {
        constructor(bpm, bpb) {
            this._bpm = bpm;
            this._bpb = bpb;
            this._beatLength = 60000 / this._bpm;
            this._barLength = Math.ceil(24 * this._bpb);
            this._timeStep = this._beatLength / 24;
            this._noteArray = Array.from({ length: this._barLength }, () => []);
        }

        newNote(pitch, startTime, duration, velocity, type, name) {
            if (startTime >= this._barLength) {
                console.error("Note start time is out of bounds");
                return;
            }
            const newNoteIndex = this._noteArray[startTime].push(new Note(pitch, duration, velocity, type, name)) - 1;

            for (let i = startTime + 1; i < Math.min(startTime + duration, this._barLength - 1); i++) {
                const currentNotes = this._noteArray[i];
                for (let n = 0; n < currentNotes.length; n++) {
                    const currentNote = currentNotes[n];
                    if (currentNote._pitch == pitch && currentNote._type === type && currentNote._name === name) {
                        this._noteArray[startTime][newNoteIndex].duration = i - startTime - 1;
                        break;
                    }
                } 
            }

            if (startTime + duration >= this._noteArray.length) {
                this._noteArray[startTime][newNoteIndex].duration = (this._noteArray.length - startTime);
            }

            return newNoteIndex;
        }

        clearNote(startTime, index) {
            this._noteArray[startTime].splice(index, 1);
        }

        detectNotes(pitch, time, type, name) {
            const notes = [];

            for (let i = 0; i < this._noteArray.length; i++) {
                const currentNotes = this._noteArray[i];
                for (let n = 0; n < currentNotes.length; n++) {
                    const currentNote = currentNotes[n];
                    if (currentNote && currentNote._pitch == pitch && time >= i && time < i + currentNote._duration && currentNote._type === type && currentNote._name === name) {
                        notes.push({ startTime: i, note: n });
                    }
                } 
            }

            return notes;
        }

        clear() {
            this._noteArray = Array.from({ length: this._barLength }, () => []);
        }

        copyPattern() {
            clipboard.unshift(this._noteArray.map(e => [...e]));
            while (clipboard.length > 5) {
                clipboard.pop(clipboard.length - 1);
            }
        }

        pastePattern() {
            for (let i = 0; i < 5; i++) {
                if (clipboard[i].length == this._barLength) {
                    this._noteArray = clipboard[i].map(e => [...e]);
                    break;
                }
            }
        }

        set setBPM(bpm) {
            this._bpm = bpm;
            this._beatLength = 60000 / this._bpm;
            this._timeStep = this._beatLength / 24;
        }

        set setBPB(bpb) {
            this._bpb = bpb;
            this._barLength = Math.ceil(24 * this._bpb);

            if (this._barLength > this._noteArray.length) {
                while (this._noteArray.length < this._barLength) {
                    this._noteArray.push([]);
                }
            } else if (this._barLength < this._noteArray.length) {
                this._noteArray.length = this._barLength;
                for (let i = 0; i < this._noteArray.length; i++) {
                    const currentNotes = this._noteArray[i];
                    for (let n = 0; n < currentNotes.length; n++) {
                        const currentNote = currentNotes[n];
                        if (i + currentNote._duration >= this._noteArray.length) currentNote.duration = (this._noteArray.length - i);
                    }
                }
            }
        }
    }

    class Note {
        constructor(pitch, duration, velocity, type, name) {
            this._pitch = pitch;
            this._duration = duration;
            this._velocity = velocity;
            this._type = type;
            this._name = name;
        }

        set pitch(pitch) {
            this._pitch = pitch;
        }

        set duration(duration) {
            this._duration = duration;
        }

        set velocity(velocity) {
            this._velocity = velocity;
        }
    }
    
    let isPlayingSong = false;
    let songTime = 0;
    let barNumber = 0;
    let patternNumber = 0;
    let previousPatternNumber = 0;
    let beatNumber = 1;
    let singleBarMode = false;
    let loop = true;
    let repeatRange = [0, 0];
    let playMetronome = false;
    let nextNoteId = 0;

    const playPauseSong = () => {
        if (isPlayingSong) {
            isPlayingSong = false;
            songTime = 0;
            while (noteArray.length > 0) {
                messageFunctions.removeVoice(noteArray[0].name, noteArray[0].freq, noteArray[0].id);
                noteArray.shift(0);
            }
        } else {
            isPlayingSong = true;
            recursivePlaySong();
        }
    }

    const playSong = () => {
        songTimeDisplay.innerHTML = `${barNumber + 1}:${beatNumber}:${(songTime % 24).toString().padStart(2, '0')}`;
        if (isPlayingSong && patternArray.length > 0) {
            if (barNumber >= patternArray.length) {
                barNumber = 0;
                patternNumber = patternArray[barNumber];
                patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
                const patternRackItems = [...document.getElementsByClassName("pattern-rack-item")];
                patternRackItems.forEach(element => {
                    element.style.backgroundColor = "rgb(24, 24, 26)";
                });
                document.querySelector(`[data-bar-number^="${barNumber}"]`).style.backgroundColor = "rgb(94, 94, 114)";
            }
            const currentNotes = patternStructure[patternArray[barNumber]]._noteArray[songTime];
            for (let index = 0; index < currentNotes.length; index++) {
                const currentNote = currentNotes[index];
                switch (currentNote._type) {
                    case "osc":
                        messageFunctions.addVoice(currentNote._name, currentNote._pitch, currentNote._velocity, nextNoteId);
                        noteArray.push({ name: currentNote._name, freq: currentNote._pitch, lifetime: currentNote._duration + 1, id: nextNoteId });
                        nextNoteId++
                        if (nextNoteId >= Number.MAX_SAFE_INTEGER - 1) {
                            nextNoteId = -Number.MAX_SAFE_INTEGER + 1;
                        }
                        break;
                    case "osc-extension":
                        const indexOfNoteToExtend = noteArray.findIndex(n => n.name === currentNote._name && n.lifetime == 1);
                        if (indexOfNoteToExtend > -1) noteArray[indexOfNoteToExtend].lifetime += currentNote._duration;
                        break;
                    case "sound":
                        soundStructure[currentNote._name]();
                        break;
                }
            }
            for (let index = 0; index < noteArray.length; index++) {
                const currentNote = noteArray[index];
                currentNote.lifetime--;
                if (currentNote.lifetime <= 0) {
                    messageFunctions.removeVoice(currentNote.name, currentNote.freq, currentNote.id);
                    noteArray.splice(index, 1);
                    index--;
                }
            }
            songTime += 1;

            if (songTime >= patternStructure[patternArray[barNumber]]._barLength) {
                barNumber += singleBarMode ? 0 : 1;
                songTime = 0;
            }
            beatNumber = Math.floor(songTime / 24) + 1;
            if (loop && !singleBarMode && barNumber > repeatRange[1]) barNumber = repeatRange[0];
            else if (!loop && barNumber > repeatRange[1]) {
                isPlayingSong = false;
                barNumber = repeatRange[1];
                playPauseBtn.innerHTML = "►";
                console.log("pause")
            }
            patternNumber = patternArray[barNumber];

            patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
            const patternRackItems = [...document.getElementsByClassName("pattern-rack-item")];
            patternRackItems.forEach(element => {
                element.style.backgroundColor = "rgb(24, 24, 26)";
            });
            document.querySelector(`[data-bar-number^="${barNumber}"]`).style.backgroundColor = "rgb(94, 94, 114)";
        }
    };

    const recursivePlaySong = () => {
        playSong();

        if (isPlayingSong) setTimeout(recursivePlaySong, patternStructure[patternArray[barNumber]]?._timeStep || songSettings.timeStep);
    };

    patternStructure[0] = new Pattern(songSettings.bpm, songSettings.bpb);

    const patternRack = document.getElementById("pattern-rack");
    const playPauseBtn = document.getElementById("play-pause-button");
    const prevBarBtn = document.getElementById("prev-bar");
    const nextBarBtn = document.getElementById("next-bar");
    const addBtn = document.getElementById("add-button");
    const insBtn = document.getElementById("ins-button");
    const delBtn = document.getElementById("del-button");
    const clrBtn = document.getElementById("clr-button");
    const cpyBtn = document.getElementById("cpy-button");
    const pasBtn = document.getElementById("pas-button");
    const prevPatternBtn = document.getElementById("prev-pattern");
    const nextPatternBtn = document.getElementById("next-pattern");
    const patternNumberDisplay = document.getElementById("pattern-number-display");
    const recordPatternBtn = document.getElementById("record-pattern-button");
    const songTimeDisplay = document.getElementById("song-time-display");
    const metronomeBtn = document.getElementById("metronome-button");
    const patternSettingsBtn = document.getElementById("pattern-settings-button");
    const sectionTitle = document.getElementById("section-title");
    let sectionTitle2 = "Song Settings"
    const setBpm = document.getElementById("set-bpm");
    const setBpb = document.getElementById("set-bpb");
    const saveSettingsBtn = document.getElementById("save-settings-button");

    async function updatePatternSettings() {
        if (showSequencer && previousPatternNumber !== patternNumber) {
            previousPatternNumber = patternNumber;
            if (sectionTitle2 === `Pattern Settings`) {
                setBpm.value = patternStructure[patternNumber]._bpm.toString();
                setBpb.value = patternStructure[patternNumber]._bpb.toString();;
            } else {
                setBpm.value = songSettings.bpm;
                setBpb.value = songSettings.bpb;
            }
        }
    }
    const updatePatternSettingsID = setInterval(updatePatternSettings, 10);

    playPauseBtn.addEventListener("pointerdown", () => {
        playPauseSong();
        if (isPlayingSong) {
            playPauseBtn.innerHTML = "||";
            console.log("play")
        } else {
            playPauseBtn.innerHTML = "►";
            console.log("pause")
        }
    });

    metronomeBtn.addEventListener("pointerdown", () => {
        if (playMetronome) {
            playMetronome = false;
        } else {
            playMetronome = true;
        }
    });

    prevBarBtn.addEventListener("pointerdown", () => {
        barNumber--;
        if (barNumber < 0) barNumber = patternArray.length - 1;
        patternNumber = patternArray[barNumber];
        patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
        const patternRackItems = [...document.getElementsByClassName("pattern-rack-item")];
        patternRackItems.forEach(element => {
            element.style.backgroundColor = "rgb(24, 24, 26)";
        });
        document.querySelector(`[data-bar-number^="${barNumber}"]`).style.backgroundColor = "rgb(94, 94, 114)";
    });

    nextBarBtn.addEventListener("pointerdown", () => {
        barNumber++;
        if (barNumber >= patternArray.length) barNumber = 0;
        patternNumber = patternArray[barNumber];
        patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
        const patternRackItems = [...document.getElementsByClassName("pattern-rack-item")];
        patternRackItems.forEach(element => {
            element.style.backgroundColor = "rgb(24, 24, 26)";
        });
        document.querySelector(`[data-bar-number^="${barNumber}"]`).style.backgroundColor = "rgb(94, 94, 114)";
    });

    addBtn.addEventListener("pointerdown", () => {
        barNumber++;
        patternArray.splice(barNumber, 0, patternNumber);
        barNumber = clamp(barNumber, 0, patternArray.length - 1);
        repeatRange[1] = patternArray.length - 1;
        let innerHTML = '';
        for (let i = 0; i < patternArray.length; i++) {
            const backgroundcolor = i == barNumber ? "rgb(94, 94, 114)" : "rgb(24, 24, 26)"
            innerHTML += `<li><div class="pattern-rack-item" data-bar-number="${i}" style="background-color: ${backgroundcolor};"><p style="margin-top: 8px; margin-bottom: 0;">${patternArray[i]}</p></div></li>`
        }
        patternRack.innerHTML = innerHTML;
    });

    insBtn.addEventListener("pointerdown", () => {
        patternArray.splice(barNumber, 0, patternNumber);
        let innerHTML = '';
        repeatRange[1] = patternArray.length - 1;
        for (let i = 0; i < patternArray.length; i++) {
            const backgroundcolor = i == barNumber ? "rgb(94, 94, 114)" : "rgb(24, 24, 26)"
            innerHTML += `<li><div class="pattern-rack-item" data-bar-number="${i}" style="background-color: ${backgroundcolor};"><p style="margin-top: 8px; margin-bottom: 0;">${patternArray[i]}</p></div></li>`
        }
        patternRack.innerHTML = innerHTML;
    });

    delBtn.addEventListener("pointerdown", () => {
        patternArray.splice(barNumber, 1);
        barNumber = clamp(barNumber, 0, patternArray.length - 1);
        repeatRange[1] = patternArray.length - 1;
        let innerHTML = '';
        for (let i = 0; i < patternArray.length; i++) {
            const backgroundcolor = i == barNumber ? "rgb(94, 94, 114)" : "rgb(24, 24, 26)"
            innerHTML += `<li><div class="pattern-rack-item" data-bar-number="${i}" style="background-color: ${backgroundcolor};"><p style="margin-top: 8px; margin-bottom: 0;">${patternArray[i]}</p></div></li>`
        }
        patternRack.innerHTML = innerHTML;
    });

    clrBtn.addEventListener("pointerdown", () => {
        patternStructure[patternNumber].clear();
    });

    cpyBtn.addEventListener("pointerdown", () => {
        patternStructure[patternNumber].copyPattern();
    });

    pasBtn.addEventListener("pointerdown", () => {
        patternStructure[patternNumber].pastePattern();
    });

    prevPatternBtn.addEventListener("pointerdown", () => {
        if (patternNumber > 0) patternNumber--;
        patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
        if (!patternStructure[patternNumber]) {
            patternStructure[patternNumber] = new Pattern(songSettings.bpm, songSettings.bpb);
        }
    });

    nextPatternBtn.addEventListener("pointerdown", () => {
        patternNumber++;
        patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
        if (!patternStructure[patternNumber]) {
            patternStructure[patternNumber] = new Pattern(songSettings.bpm, songSettings.bpb);
        }
    });

    patternNumberDisplay.addEventListener("wheel", (event) => {
        event.preventDefault();
        if (event.deltaY > 0) {
            if (patternNumber > 0) patternNumber--;
            patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
        } else if (event.deltaY < 0) {
            patternNumber++;
            patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
        }
    });

    patternRack.addEventListener("pointerdown", (event) => {
        const patternRackItems = [...document.getElementsByClassName("pattern-rack-item")];
        patternRackItems.forEach(element => {
            element.style.backgroundColor = "rgb(24, 24, 26)";
        });
        let target = event.target;
        if (target.tagName == "P") target = target.parentElement;
        else if (target.tagName == "UL") return;
        barNumber = Number(target.getAttribute("data-bar-number"));
        target.style.backgroundColor = "rgb(94, 94, 114)";
        patternNumber = patternArray[barNumber];
        patternNumberDisplay.innerHTML = `Pattern: ${patternNumber}`;
    });

    saveSettingsBtn.addEventListener("pointerdown", () => {
        switch (sectionTitle2) {
            case "Song Settings":
                songSettings.bpm = Number(setBpm.value);
                songSettings.bpb = Number(setBpb.value);
                songSettings.beatLength = 60000 / songSettings.bpm;
                songSettings.barLength = songSettings.beatLength * songSettings.bpb;
                songSettings.timeStep = songSettings.beatLength / 24;
                break;
            case "Pattern Settings":
                patternStructure[patternNumber].setBPM = Number(setBpm.value);
                patternStructure[patternNumber].setBPB = Number(setBpb.value);
                console.log(patternStructure[patternNumber])
                break;
        }
    });

    patternSettingsBtn.addEventListener("pointerdown", () => {
        sectionTitle.innerHTML = '<span id="section-back-button" class="link">←</span> Pattern Settings';
        sectionTitle2 = "Pattern Settings"
        const sectionBackBtn = document.getElementById("section-back-button");
        sectionBackBtn.addEventListener("pointerdown", () => {
            sectionTitle.innerHTML = "Song Settings";
            sectionTitle2 = "Song Settings";
            setBpm.value = songSettings.bpm;
            setBpb.value = songSettings.bpb;
        });
    });

    const mousePos = { X: 0, Y: 0, cX: 0, cY: 0 };
    const oscillatorSelection = document.getElementById("osc-selection");
    const osctaveScrollBar = document.getElementById("octave-scrollbar");
    const gridSizeSelect = document.getElementById("grid-space-select");
    const pianoRollZoomOut = document.getElementById("zoom-out");
    const pianoRollZoomIn = document.getElementById("zoom-in");
    const octaveNumberDisplay = document.getElementById("octave-number-display");
    let oscillatorToPlace = null;
    let pianoRollOctave = 5;
    let pianoRollGridSize = 4;
    let pianoRollGridLength = 6;
    let pianoRollZoom = 3;
    let currentNoteSize = 1;
    let deleting = false;
    let moving = false;
    let resizing = false;
    let resizeDirection = "none";
    let currentNoteToEdit = null;
    let currentNoteToEditIndex = 0;
    let currentNoteToEditStartTime = 0;
    let currentNoteToMoveDragTime = 0;
    let currentNoteToEditEndTime = 0;

    oscillatorSelection.addEventListener("change", () => {
        oscillatorToPlace = oscillatorSelection.value;
    });
    oscillatorToPlace = oscillatorSelection.value;

    osctaveScrollBar.addEventListener("input", () => {
        pianoRollOctave = osctaveScrollBar.value;
    });
    pianoRollOctave = osctaveScrollBar.value;

    gridSizeSelect.addEventListener("change", () => {
        pianoRollGridSize = Number(gridSizeSelect.value);
        pianoRollGridLength = 24 / pianoRollGridSize;
        currentNoteSize = 1;
    });
    pianoRollGridSize = Number(gridSizeSelect.value);

    pianoRollZoomOut.addEventListener("pointerdown", () => {
        pianoRollZoom++;
        octaveNumberDisplay.innerHTML = `${pianoRollZoom} Octaves`
    });

    pianoRollZoomIn.addEventListener("pointerdown", () => {
        if (pianoRollZoom > 1) pianoRollZoom--;
        octaveNumberDisplay.innerHTML = `${pianoRollZoom} Octaves`
    });
    octaveNumberDisplay.innerHTML = `${pianoRollZoom} Octaves`

    function toCSpace(p) {
        x = Math.floor(p[0] / seqCvs.width * 24 * patternStructure[patternNumber]._bpb);
        y = Math.floor((-p[1] / seqCvs.height + 1) * 12 * pianoRollZoom) + 12 * ((pianoRollOctave - 5) - Math.floor((pianoRollZoom - 1) / 2));
        return [x,y];
    }

    function fromCSpace(p) {
        x = p[0] / (24 * patternStructure[patternNumber]._bpb) * seqCvs.width;
        y = (1 - (p[1] - 12 * ((pianoRollOctave - 5) - Math.floor((pianoRollZoom - 1) / 2))) / (12 * pianoRollZoom)) * seqCvs.height;
        return [x,y];
    }

    function drawPianoRoll() {
        for (let r = -12 * Math.floor((pianoRollZoom - 1) / 2); r < 12 * (pianoRollZoom - Math.floor((pianoRollZoom - 1) / 2)); r++) {
            const rMod12 = ((r % 12) + 12) % 12;
            if (rMod12 == 1 || rMod12 == 3 || rMod12 == 6 || rMod12 == 8 || rMod12 == 10) { 
                seqCtx.fillStyle = "rgb(38,38,43)";
            } else {
                seqCtx.fillStyle = "rgb(43,43,46)";
            }

            seqCtx.fillRect(0, fromCSpace([0, r + 1 + 12 * (pianoRollOctave - 5)])[1], seqCvs.width, seqCvs.height / (12 * pianoRollZoom));
        }

        seqCtx.strokeStyle = "rgb(24,24,26)";
        seqCtx.beginPath();
        for (let l = 0; l < patternStructure[patternNumber]._bpb; l++) {
            seqCtx.moveTo(fromCSpace([l * 24])[0], 0);
            seqCtx.lineTo(fromCSpace([l * 24])[0], seqCvs.height);
        }
        seqCtx.stroke();
        seqCtx.strokeStyle = "rgb(38,38,43)";
        seqCtx.beginPath();
        for (let l = 1; l < pianoRollZoom; l++) {
            seqCtx.moveTo(0, seqCvs.height * l / pianoRollZoom);
            seqCtx.lineTo(seqCvs.width, seqCvs.height * l / pianoRollZoom);
        }
        seqCtx.stroke();

        const notesToDrawLater = [];
        seqCtx.fillStyle = "rgb(94, 94, 114)";
        for (let i = 0; i < patternStructure[patternNumber]._noteArray.length; i++) {
            const currentNotes = patternStructure[patternNumber]._noteArray[i];
            for (let n = 0; n < currentNotes.length; n++) {
                const currentNote = currentNotes[n];
                if (currentNote._name == oscillatorToPlace) notesToDrawLater.push({ startTime: i, currentNote });
                else seqCtx.fillStyle = seqCtx.fillRect(fromCSpace([i,currentNote._pitch])[0], fromCSpace([i,currentNote._pitch + 1])[1], fromCSpace([currentNote._duration,0])[0], seqCvs.height / (12 * pianoRollZoom));
            }
        }
        seqCtx.fillStyle = "rgb(0,185,185)"
        for (let i = 0; i < notesToDrawLater.length; i++) {
            const currentNote = notesToDrawLater[i].currentNote;
            const currentNoteStartTime = notesToDrawLater[i].startTime;
            seqCtx.fillRect(fromCSpace([currentNoteStartTime,currentNote._pitch])[0], fromCSpace([currentNoteStartTime,currentNote._pitch + 1])[1], fromCSpace([currentNote._duration,0])[0], seqCvs.height / (12 * pianoRollZoom));
        }

        seqCtx.fillStyle = "rgb(255,255,255)";
        seqCtx.fillRect(fromCSpace([songTime,0])[0], 0, 2, seqCvs.height);
    }

    function drawPianoRollAnimation() {
        requestAnimationFrame(drawPianoRollAnimation);
        seqCtx.clearRect(0,0,seqCvs.width,seqCvs.height);

        if (showSequencer) drawPianoRoll();
    }
    drawPianoRollAnimation();

    seqCvs.addEventListener("contextmenu", (event) => {
        event.preventDefault();

        const noteInfo = patternStructure[patternNumber].detectNotes(mousePos.cY, mousePos.cX, "osc", oscillatorToPlace)[0];
        if (noteInfo) patternStructure[patternNumber].clearNote(noteInfo.startTime, noteInfo.note);
    });

    seqCvs.addEventListener("mousedown", (event) => {
        if (event.button == 0) {
            let noteInfo = patternStructure[patternNumber].detectNotes(mousePos.cY, mousePos.cX, "osc", oscillatorToPlace)[0];
            let note;
            if (noteInfo) {
                note = patternStructure[patternNumber]._noteArray[noteInfo.startTime][noteInfo.note];
                currentNoteToEdit = note;
                currentNoteToEditStartTime = noteInfo.startTime;
                currentNoteToEditEndTime = noteInfo.startTime + note._duration;
                currentNoteToEditIndex = noteInfo.note;
                if (fromCSpace([noteInfo.startTime + note._duration,0])[0] - mousePos.X <= 8 && !moving) {
                    resizing = true;
                    resizeDirection = "right";
                } else if (mousePos.X - fromCSpace([noteInfo.startTime,0])[0] <= 8 && !moving) {
                    resizing = true;
                    resizeDirection = "left";
                } else {
                    moving = true;
                    currentNoteToMoveDragTime = mousePos.cX - currentNoteToEditStartTime;
                    currentNoteSize = Math.ceil(currentNoteToEdit._duration / pianoRollGridLength);
                }
            } else {
                patternStructure[patternNumber].newNote(mousePos.cY, Math.floor(mousePos.cX / pianoRollGridLength) * pianoRollGridLength, currentNoteSize * pianoRollGridLength, 0.78125, "osc", oscillatorToPlace);
                noteInfo = patternStructure[patternNumber].detectNotes(mousePos.cY, mousePos.cX, "osc", oscillatorToPlace)[0];
                note = patternStructure[patternNumber]._noteArray[noteInfo.startTime][noteInfo.note];
                currentNoteToEdit = note;
                currentNoteToEditStartTime = noteInfo.startTime;
                currentNoteToEditIndex = noteInfo.note;
                moving = true;
                currentNoteToMoveDragTime = mousePos.cX - currentNoteToEditStartTime;
            }
        } else if (event.button = 1) {
            deleting = true;
        }
    });

    seqCvs.addEventListener("mouseup", () => {
        deleting = false;
        moving = false;
        resizing = false;
    });

    seqCvs.addEventListener('mousemove', (event) => {
        mousePos.X = event.clientX;
        mousePos.Y = event.clientY;
        let cSpaceMousePos = toCSpace([mousePos.X, mousePos.Y]);
        mousePos.cX = cSpaceMousePos[0];
        mousePos.cY = cSpaceMousePos[1];

        if (deleting) {
            const noteInfo = patternStructure[patternNumber].detectNotes(mousePos.cY, mousePos.cX, "osc", oscillatorToPlace)[0];
            if (noteInfo) patternStructure[patternNumber].clearNote(noteInfo.startTime, noteInfo.note);
        } else if (moving) {
            currentNoteSize = Math.ceil(currentNoteToEdit._duration / pianoRollGridLength);
            const newStartTime = Math.max(Math.ceil((mousePos.cX - currentNoteToMoveDragTime) / pianoRollGridLength) * pianoRollGridLength, 0);
            patternStructure[patternNumber].clearNote(currentNoteToEditStartTime, currentNoteToEditIndex);
            const newNoteIndex = patternStructure[patternNumber].newNote(mousePos.cY, newStartTime, currentNoteToEditEndTime > patternStructure[patternNumber]._barLength ? patternStructure[patternNumber]._barLength - newStartTime : currentNoteToEdit._duration, currentNoteToEdit._velocity, currentNoteToEdit._type, currentNoteToEdit._name);
            const noteInfo = patternStructure[patternNumber].detectNotes(mousePos.cY, newStartTime, "osc", oscillatorToPlace)[0];
            const note = patternStructure[patternNumber]._noteArray[noteInfo.startTime][noteInfo.note];
            currentNoteToEdit = note;
            currentNoteToEditStartTime = newStartTime;
            currentNoteToEditEndTime = currentNoteToEditStartTime + currentNoteToEdit._duration;
            currentNoteToEditIndex = newNoteIndex;
        } else if (!moving && resizing) {
            switch (resizeDirection) {
                case "right":
                    currentNoteSize = Math.max(Math.ceil(((mousePos.cX - currentNoteToEditStartTime) / (pianoRollGridLength))), 1);
                    currentNoteToEdit.duration = currentNoteSize * pianoRollGridLength;
                    break;
                case "left":
                    const newStartTime = Math.floor(mousePos.cX / pianoRollGridLength) * pianoRollGridLength;
                    currentNoteSize = Math.max(Math.ceil(((currentNoteToEditEndTime - mousePos.cX) / (pianoRollGridLength))), 1);
                    patternStructure[patternNumber].clearNote(currentNoteToEditStartTime, currentNoteToEditIndex);
                    const newNoteIndex = patternStructure[patternNumber].newNote(currentNoteToEdit._pitch, newStartTime, currentNoteSize * pianoRollGridLength, currentNoteToEdit._velocity, currentNoteToEdit._type, currentNoteToEdit._name);
                    const noteInfo = patternStructure[patternNumber].detectNotes(currentNoteToEdit._pitch, newStartTime, "osc", oscillatorToPlace)[0];
                    const note = patternStructure[patternNumber]._noteArray[noteInfo.startTime][noteInfo.note];
                    currentNoteToEdit = note;
                    currentNoteToEditStartTime = newStartTime;
                    currentNoteToEditIndex = newNoteIndex;
                    currentNoteToEditEndTime = newStartTime + currentNoteSize * pianoRollGridLength;
                    break;
            }
        }
    });
    
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
        console.log('Message from UOsc Synth:', event.data);

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
                synthParamsInputHTMLforUOSynth[2].value = event.data.arrayParameters._damping ? `[${event.data.arrayParameters._damping}]` : event.data.parameters._damping;
                synthParamsInputHTMLforUOSynth[3].value = event.data.arrayParameters._wavetype ? `[${event.data.arrayParameters._wavetype}]` : event.data.parameters._wavetype;
                synthParamsInputHTMLforUOSynth[4].value = event.data.arrayParameters._shift ? `[${event.data.arrayParameters._shift}]` : event.data.parameters._shift;
                synthParamsInputHTMLforUOSynth[5].value = event.data.arrayParameters._pull ? `[${event.data.arrayParameters._pull}]` : event.data.parameters._pull;
                synthParamsInputHTMLforUOSynth[6].value = event.data.arrayParameters._partialFrequencyInverter ? `[${event.data.arrayParameters._partialFrequencyInverter}]` : event.data.parameters._partialFrequencyInverter;
                synthParamsInputHTMLforUOSynth[7].value = event.data.arrayParameters._partialComb ? `[${event.data.arrayParameters._partialComb}]` : event.data.parameters._partialComb;
                synthParamsInputHTMLforUOSynth[8].value = event.data.arrayParameters._partialPhaseShifter ? `[${event.data.arrayParameters._partialPhaseShifter}]` : event.data.parameters._partialPhaseShifter;
                synthParamsInputHTMLforUOSynth[9].value = event.data.arrayParameters._pwmMix ? `[${event.data.arrayParameters._pwmMix}]` : event.data.parameters._pwmMix;
                synthParamsInputHTMLforUOSynth[10].value = event.data.arrayParameters._pwmPhase ? `[${event.data.arrayParameters._pwmPhase}]` : event.data.parameters._pwmPhase;
                synthParamsInputHTMLforUOSynth[11].value = event.data.arrayParameters._flangingPhase ? `[${event.data.arrayParameters._flangingPhase}]` : event.data.parameters._flangingPhase;
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
                    synthesizeBtn.innerText = 'Synthesize & Save Oscillator';
                    synthesizeBtn.style.cursor = 'pointer';
                    if (document.getElementById("save-preset-btn-2")) {
                        const fractalSynthesizeBtn = document.getElementById("save-preset-btn-2");
                        fractalSynthesizeBtn.disabled = false;
                        fractalSynthesizeBtn.setAttribute('aria-disabled', 'false');
                        fractalSynthesizeBtn.innerText = 'Fractalize & Save Oscillator';
                        fractalSynthesizeBtn.style.cursor = 'pointer';
                    }
                }
                break;
            case "givenOscillator":
                const oscillator = event.data.oscillator;
                if (oscillator._oscillatorSamples) {
                    oscillatorSamplesArray = oscillator._oscillatorSamples;
                    oscillatorMaxAmp = oscillator._oscillatorMaxAmp;
                } else {
                    wavetableWorker.postMessage({ type: 'synthesizeWavetable', oscName: oscillator._name, oscillatorPhazorInfo: calcOscillatorPartials({
                        frequencies: oscillator._oscillatorPartialFreqs, 
                        amplitudes: oscillator._oscillatorPartialAmps, 
                        phases: oscillator._oscillatorPartialPhases
                    }, 48000, {
                        maxPartials: oscillator._params._partialCount
                    }), oscillatorPeriod: Number.isNaN(oscillator._oscillatorPeriod) ? 48000 : oscillator._oscillatorPeriod });
                    document.getElementById("export-wav-button").style.cursor = 'wait';
                }
                if (!showSequencer) {
                    let oscillatorPhazorInfo = undefined;
                    oscillatorPhazorInfo = calcOscillatorPartials({
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
                    
                    const N = oscillatorPhazorInfo.partialCount;

                    let freeRunMaxVal = 1;
                    let sineFreeRunMaxVal = 1;
                    const initPhX = oscillatorPhazorInfo.phX.map(v => v);
                    const initPhY = oscillatorPhazorInfo.phY.map(v => v);
                    for (let i = 0; i < visualSampleCount; i++) {
                        let currentVal = 0;
                        const amps = oscillatorPhazorInfo.amps, phX = oscillatorPhazorInfo.phX, phY = oscillatorPhazorInfo.phY, cI = oscillatorPhazorInfo.cosInc, sI = oscillatorPhazorInfo.sinInc;
                        for (let k = 0; k < N; k++) {
                            currentVal += amps[k] * phY[k];
                            const xP = phX[k], yP = phY[k];
                            const mag = xP * xP + yP * yP;
                            phX[k] = (xP * cI[k] - yP * sI[k]);
                            phY[k] = (xP * sI[k] + yP * cI[k]);
                            if (Math.abs(1 - mag) > 1e-6) {
                                const normFactor = 1 / Math.sqrt(mag);
                                phX[k] *= normFactor;
                                phY[k] *= normFactor;
                            }
                            if (Math.abs(currentVal) > sineFreeRunMaxVal) sineFreeRunMaxVal = Math.abs(currentVal);
                        }
                        if (Math.abs(currentVal) > freeRunMaxVal) freeRunMaxVal = Math.abs(currentVal);
                    }
                    oscillatorPhazorInfo.phX = initPhX;
                    oscillatorPhazorInfo.phY = initPhY;

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
                        const amps = oscillatorPhazorInfo.amps, phX = oscillatorPhazorInfo.phX, phY = oscillatorPhazorInfo.phY, cI = oscillatorPhazorInfo.cosInc, sI = oscillatorPhazorInfo.sinInc;
                        if (visualOscDrawType == "oscilloscope") {
                            for (let k = 0; k < N; k++) {
                                currentVal += amps[k] * phY[k];
                                const xP = phX[k], yP = phY[k];
                                const mag = xP * xP + yP * yP;
                                phX[k] = (xP * cI[k] - yP * sI[k]);
                                phY[k] = (xP * sI[k] + yP * cI[k]);
                                if (Math.abs(1 - mag) > 1e-6) {
                                    const normFactor = 1 / Math.sqrt(mag);
                                    phX[k] *= normFactor;
                                    phY[k] *= normFactor;
                                }
                            }
                            if (Math.abs(currentVal) > freeRunMaxVal) freeRunMaxVal = Math.abs(currentVal);

                            y = clamp(currentVal / freeRunMaxVal * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
                            oscCtx.beginPath();
                            oscCtx.moveTo(prevX, prevY);
                            oscCtx.lineTo(x, y);
                            oscCtx.stroke();

                            prevY = y;
                        } else if (visualOscDrawType == "fourierOscilloscope") {
                            for (let k = 0; k < N; k++) {
                                currentVal = amps[k] / amps[0] * phY[k];
                                const xP = phX[k], yP = phY[k];
                                const mag = xP * xP + yP * yP;
                                phX[k] = (xP * cI[k] - yP * sI[k]);
                                phY[k] = (xP * sI[k] + yP * cI[k]);
                                if (Math.abs(1 - mag) > 1e-6) {
                                    const normFactor = 1 / Math.sqrt(mag);
                                    phX[k] *= normFactor;
                                    phY[k] *= normFactor;
                                }
                                if (Math.abs(currentVal) > sineFreeRunMaxVal) sineFreeRunMaxVal = Math.abs(currentVal);

                                yArray[k] = clamp(currentVal / sineFreeRunMaxVal * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
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
                        const N = oscillatorPhazorInfo.partialCount;
                        const amps = oscillatorPhazorInfo.amps, phX = oscillatorPhazorInfo.phX, phY = oscillatorPhazorInfo.phY, cI = oscillatorPhazorInfo.cosInc, sI = oscillatorPhazorInfo.sinInc;
                        if (visualOscDrawType == "oscilloscope") {
                            for (let k = 0; k < N; k++) {
                                currentVal += amps[k] * phY[k];
                                const xP = phX[k], yP = phY[k];
                                const mag = xP * xP + yP * yP;
                                phX[k] = (xP * cI[k] - yP * sI[k]);
                                phY[k] = (xP * sI[k] + yP * cI[k]);
                                if (Math.abs(1 - mag) > 1e-6) {
                                    const normFactor = 1 / Math.sqrt(mag);
                                    phX[k] *= normFactor;
                                    phY[k] *= normFactor;
                                }
                            }
                            if (Math.abs(currentVal) > freeRunMaxVal) freeRunMaxVal = Math.abs(currentVal);

                            const yVal = clamp(currentVal / freeRunMaxVal * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
                            oscCtx.beginPath();
                            oscCtx.moveTo(oscCvs.width - 2, prevY);
                            oscCtx.lineTo(oscCvs.width - 1, yVal);
                            oscCtx.stroke();

                            prevY = yVal;
                        } else if (visualOscDrawType == "fourierOscilloscope") {
                            for (let k = 0; k < N; k++) {
                                currentVal = amps[k] * phY[k];
                                const xP = phX[k], yP = phY[k];
                                const mag = xP * xP + yP * yP;
                                phX[k] = (xP * cI[k] - yP * sI[k]);
                                phY[k] = (xP * sI[k] + yP * cI[k]);
                                if (Math.abs(1 - mag) > 1e-6) {
                                    const normFactor = 1 / Math.sqrt(mag);
                                    phX[k] *= normFactor;
                                    phY[k] *= normFactor;
                                }
                                if (Math.abs(currentVal) > sineFreeRunMaxVal) sineFreeRunMaxVal = Math.abs(currentVal);

                                yArray[k] = clamp(currentVal / sineFreeRunMaxVal * -visualOscScalar + oscCvs.height / 2, 0, oscCvs.height - 1);
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
                }
                break;
            case "recordedAudio":
                const recordedAudio = event.data.data;
                const maxAmp = event.data.maxAmp || 1;
                downloadWAV(recordedAudio, maxAmp, "recording");
                break;
            case "recordedSound":
                soundStructure[event.data.name] = () => { return messageFunctions.playsound(event.data.name, 1) };
                break;
        }
    };

    const wavetableWorker = new Worker('The Ultimate Oscillator Generator/synthesizeWavetableWorker.js');
    wavetableWorker.onmessage = (event) => {
        console.log('Message from wavetable worker:', event.data);

        switch (event.data.type) {
            case 'error':
                document.getElementById("export-wav-button").style.cursor = 'pointer';
                alert(event.data.message);
                break;
            case 'alert':
                alert(event.data.message);
                break;
            case 'progressUpdate':
                const exportWavBtn = document.getElementById("export-wav-button");
                exportWavBtn.innerHTML = `${event.data.progress}%`;
                exportWavBtn.setAttribute('data-export-estimate-time', event.data.estimateTime);
                break;
            case 'givenWavetable':
                oscillatorSamplesArray = event.data.wavetable.map(v => v);
                oscillatorMaxAmp = event.data.maxAmp || 1;
                uoSynthNode.port.postMessage({ type: 'givenWavetable', oscName: event.data.oscName, wavetable: event.data.wavetable, maxAmp: event.data.maxAmp }, [event.data.wavetable.buffer]);
                document.getElementById("export-wav-button").innerHTML = `Export .wav`;
                document.getElementById("export-wav-button").style.cursor = 'pointer';
                break;
            case 'testingResponse':
                console.log('Testing response received from worker:', event.data.data);
                uoSynthNode.port.postMessage({ type: 'LUTSineData', data: event.data.data });
                break;
        }
    }

    wavetableWorker.postMessage({ type: 'testing' });

    const messageFunctions = Object.freeze({
        createOsc: (oscName) => {
            uoSynthNode.port.postMessage({
                type: "createOsc",
                oscName: oscName,
            });
        },
        deleteOsc: (oscName, bypassAlert = false) => {
            uoSynthNode.port.postMessage({
                type: "deleteOsc",
                oscName: oscName,
                bypassAlert: bypassAlert
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
        renameOsc: (oscName, newOscName) => {
            uoSynthNode.port.postMessage({
                type: "renameOsc",
                oscName: oscName,
                newOscName: newOscName
            })
        },
        loadSession: (sessionData) => {
            uoSynthNode.port.postMessage({
                type: "loadSession",
                sessionData: sessionData
            });
        },
        addVoice: (oscName, frequency, velocity, id) => {
            uoSynthNode.port.postMessage({
                type: "addVoice",
                oscName: oscName,
                frequency: frequency,
                velocity: velocity,
                id: id
            });
        },
        removeVoice: (oscName, frequency, id) => {
            uoSynthNode.port.postMessage({
                type: "removeVoice",
                oscName: oscName,
                frequency: frequency,
                id: id
            });
        },
        playsound: (name, speed) => {
            uoSynthNode.port.postMessage({
                type: "playsound",
                name: name,
                speed: speed
            });
        },
        stopSound: (name) => {
            uoSynthNode.port.postMessage({
                type: "stopSound",
                name: name
            });
        },
        recordSound: (oscName, id) => {
            uoSynthNode.port.postMessage({
                type: "recordSound",
                oscName: oscName,
                id: id
            });
        },
        stopRecordingSound: () => {
            uoSynthNode.port.postMessage({
                type: "stopRecordingSound"
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
        },
        transpose: (transpose) => {
            uoSynthNode.port.postMessage({
                type: "transpose",
                transpose: transpose
            });
        },
        setTransposition: (transpose) => {
            uoSynthNode.port.postMessage({
                type: "setTransposition",
                transpose: transpose
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

        oscillatorSamplesArray = null;
        if (fractalSynthesis) {
            const argTextBox = document.getElementsByClassName('fractalize-arg-text-box')[0];
            messageFunctions.synthesize(argTextBox.value);
            document.getElementById("export-wav-button").innerHTML = `${0}%`;

            const fractalize = document.createElement('button');
            fractalize.id = 'save-preset-btn-2';
            fractalize.classList.add('save-preset-btn-2');
            fractalize.innerText = 'Fractalize & Save Oscillator';

            argTextBox.replaceWith(fractalize);
            document.getElementsByClassName('synthesize-btn-container')[0].removeChild(document.getElementsByClassName('fractalize-cancel-btn')[0]);

            fractalSynthesis = false;
            try { uoSynthNode.port.removeEventListener('message', synthesisMessageHandler, { once: true }); } catch (e) {}
            return;
        } else {
            try { uoSynthNode.port.removeEventListener('message', synthesisMessageHandler, { once: true }); } catch (e) {}
            document.getElementById("export-wav-button").innerHTML = `${0}%`;
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
            const fractalizeCancelBtn = document.createElement('button');
            fractalizeCancelBtn.innerText = 'Cancel';
            fractalizeCancelBtn.classList.add('fractalize-cancel-btn');
            fractalizeCancelBtn.style.width = "216px";
            fractalizeCancelBtn.style.marginLeft = "224px";
            fractalizeCancelBtn.style.marginTop = "4px";
            fractalizeCancelBtn.addEventListener('click', () => {
                const argTextBox = document.getElementsByClassName('fractalize-arg-text-box')[0];

                const fractalize = document.createElement('button');
                fractalize.id = 'save-preset-btn-2';
                fractalize.classList.add('save-preset-btn-2');
                fractalize.innerText = 'Fractalize & Save Oscillator';

                argTextBox.replaceWith(fractalize);
                document.getElementsByClassName('synthesize-btn-container')[0].removeChild(fractalizeCancelBtn);

                fractalSynthesis = false;
                try { uoSynthNode.port.removeEventListener('message', synthesisMessageHandler, { once: true }); } catch (e) {}
                return;
            });

            fractalize.replaceWith(argTextBox);
            document.getElementsByClassName('synthesize-btn-container')[0].appendChild(fractalizeCancelBtn);
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

    visualOscDrawType = document.getElementById("visualOscDrawType").value;

    function setVoice(action, freq, velocity = 1) {
        if (action === 'add') {
            messageFunctions.addVoice(selectedOscName, freq, velocity, "keyboard");
            if (freq >= -12 && freq <= 21) {
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
            messageFunctions.removeVoice(selectedOscName, freq, "keyboard");
            if (freq >= -12 && freq <= 21) {
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

    /*
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

    document.getElementsByClassName('keyboard-buttons-container')[0].addEventListener('pointerexit', () => {
        setVoice("remove", pointerPitch);
    });
    */

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
            case "ArrowDown":
                messageFunctions.changeOctave(-1);
                break;
            case "ArrowUp":
                messageFunctions.changeOctave(1);
                break;
            case "ArrowLeft":
                messageFunctions.transpose(-1);
                break;
            case "ArrowRight":
                messageFunctions.transpose(1);
                break;
            case "S":
                if (showSequencer) {
                    showSequencer = false;
                    document.getElementsByClassName("main")[0].style.display = "flex";
                    document.getElementsByClassName("sequencer")[0].style.display = "none";
                } else {
                    showSequencer = true;
                    document.getElementsByClassName("main")[0].style.display = "none";
                    document.getElementsByClassName("sequencer")[0].style.display = "flex";

                    uoSynthNode.port.addEventListener('message', (event) => {
                        if (event.data.type == "givenOscStructure") {
                            oscStructure = event.data.data;
                            let innerHTML = '';
                            Object.keys(oscStructure).forEach((_key) => {
                                innerHTML += `<option value="${_key}">${_key}</option>`;
                            });
                            oscillatorSelection.innerHTML = innerHTML;
                        }
                    }, { once: true });
                    uoSynthNode.port.postMessage({ type: 'getOscStructure' });
                }
                break;
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
            case "Shift":
                messageFunctions.setOctave(5);
                messageFunctions.setTransposition(0);
                break;
        }
    });

    const downloadWAV = (data, maxAmp, fileType) => {
        const sampleRate = synthCtx.sampleRate;
        const durationSeconds = (data.length || 0) / sampleRate;
        const numChannels = 1;
        const bytesPerSample = 2 * numChannels;
        const bytesPerSecond = sampleRate * bytesPerSample;
        const dataLength = bytesPerSecond * Math.ceil(durationSeconds);
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
        console.log(waveBlob, waveBlobURL);
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

    const exportWavButton = document.getElementById("export-wav-button");

    exportWavButton.addEventListener("click", () => {
        if (!oscillatorSamplesArray) {
            let alertAppendText = ''
            if (exportWavButton.innerHTML !== 'Export .wav') alertAppendText = `The data is still generating; current progress is ${exportWavButton.innerHTML}. Estimated time remaiing is ${exportWavButton.getAttribute('data-export-estimate-time')}`;
            else alertAppendText = 'Uhh, something went wrong...'
            alert(`There is no oscillator data to export... ${alertAppendText}`);
        }
        else downloadWAV(oscillatorSamplesArray, oscillatorMaxAmp, "oscillator");
    });

    let isRecording = false;

    const recordButton = () => {
        uoSynthNode.port.postMessage({ type: 'startRecording' });
        isRecording = true;
        const recordBtn = document.getElementById('record-wav-button');
        let recordingTime = 0;
        recordBtn.innerText = `${toHMS(0)}`;
        const incrementTimePromise = async () => {
            while (isRecording) {
                await wait(1000);
                if (isRecording) {
                    recordingTime += 1;
                    recordBtn.innerText = `${toHMS(recordingTime)}`;
                }
            }
        }
        incrementTimePromise();
        recordBtn.style.backgroundColor = 'rgb(255, 0, 0)';

        const stopRecordingFunction = () => {
            if (!isRecording) return;
            uoSynthNode.port.postMessage({ type: 'stopRecording' });
            isRecording = false;
            recordBtn.innerText = 'Record .wav';
            recordBtn.style.backgroundColor = 'rgb(24, 24, 26)';
            recordBtn.removeEventListener('click', recordButton);
            recordBtn.removeEventListener('click', stopRecordingFunction);
            recordBtn.addEventListener('click', recordButton);
        }
        recordBtn.addEventListener('click', stopRecordingFunction);
    }
    document.getElementById('record-wav-button').addEventListener('click', recordButton);

    function buildSessionObject(oscStructure) {
        const session = {
            metadata: {
                generatedAt: (new Date()).toISOString(),
                sampleRate: synthCtx.sampleRate,
            },
            oscillators: {},
            song: {
                bpm: 120,
                bpb: 4,
                patternStructure: [],
                patternOrder: []
            }
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

        session.song.bpm = songSettings.bpm;
        session.song.bpb = songSettings.bpb;
        for (let i = 0; i < patternStructure.length; i++) {
            const currentPattern = patternStructure[i];
            const pattern = { bpm: currentPattern._bpm, bpb: currentPattern._bpb, noteArray: [] };
            for (let s = 0; s < currentPattern._noteArray.length; s++) {
                const currentNotes = currentPattern._noteArray[s];
                if (currentNotes.length > 0) {
                    const timeSlot = [];
                    timeSlot[0] = s;
                    for (let n = 0; n < currentNotes.length; n++) {
                        const currentNote = currentNotes[n];
                        const stringifiedNote = `D${currentNote._duration}P${currentNote._pitch}V${Math.round(currentNote._velocity * 128)}E(${currentNote._type})N(${currentNote._name})`;
                        timeSlot.push(stringifiedNote);
                    }
                    pattern.noteArray.push(timeSlot);
                }
            }
            session.song.patternStructure.push(pattern);
        }
        session.song.patternOrder = [...patternArray];

        return session;
    }

    function downloadJSON(obj, filename = 'uosc-session.json') {
        const text = JSON.stringify(obj, null, 2);
        const sessionBlob = new Blob([text], { type: 'application/json' });
        const sessionBlobUrl = URL.createObjectURL(sessionBlob);
        console.log(sessionBlob, sessionBlobUrl);
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

    function stringifiedNoteParser(string) {
        // Format: DnPnVnE(s)N(s)
        const durationMatch = string.match(/D(\d+(\.\d+)?)/g);
        const pitchMatch = string.match(/P(-?\d+(\.\d+)?)/g);
        const velocityMatch = string.match(/V(\d+(\.\d+)?)/g);
        const typeMatch = string.match(/E\((\w+)\)/g);
        const nameMatch = string.match(/N\((.+)\)/g);

        const duration = parseFloat(durationMatch[0].slice(1));
        const pitch = parseFloat(pitchMatch[0].slice(1));
        const velocity = parseFloat(velocityMatch[0].slice(1)) / 128;
        const type = typeMatch?.[0].slice(2, -1) ?? '';
        const name = nameMatch?.[0].slice(2, -1) ?? '';

        return { duration, pitch, velocity, type, name };
    }

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
                if (data && data.oscillators && data.song) {
                    messageFunctions.loadSession(data.oscillators);

                    songSettings.bpm = data.song.bpm;
                    songSettings.bpb = data.song.bpb;
                    songSettings.beatLength = 60000 / songSettings.bpm;
                    songSettings.barLength = songSettings.beatLength * songSettings.bpb;
                    songSettings.timeStep = songSettings.beatLength / 24;

                    let fileEfficient = true;
                    let lock = false;
                    patternStructure.shift();
                    for (let i = 0; i < data.song.patternStructure.length; i++) {
                        const currentPattern = data.song.patternStructure[i];
                        const pattern = new Pattern(currentPattern.bpm, currentPattern.bpb);
                        let currentTimeSlot = currentPattern.noteArray[0];
                        for (let s = 0; s < currentPattern.noteArray.length; s++) {
                            currentTimeSlot = currentPattern.noteArray[s];
                            if (fileEfficient && !lock && typeof currentTimeSlot[0] !== 'number') fileEfficient = false;
                            else lock = true;
                            if (fileEfficient) {
                                for (let n = 1; n < currentTimeSlot.length; n++) {
                                    const parsedNote = stringifiedNoteParser(currentTimeSlot[n]);
                                    pattern.newNote(parsedNote.pitch, currentTimeSlot[0], parsedNote.duration, parsedNote.velocity, parsedNote.type, parsedNote.name);
                                }
                            } else {
                                for (let n = 0; n < currentTimeSlot.length; n++) {
                                    const parsedNote = stringifiedNoteParser(currentTimeSlot[n]);
                                    pattern.newNote(parsedNote.pitch, s, parsedNote.duration, parsedNote.velocity, parsedNote.type, parsedNote.name);
                                }
                            }
                        }
                        patternStructure.push(pattern);
                    }
                    patternArray.push(...data.song.patternOrder);
                    repeatRange[1] = patternArray.length - 1;
                    let innerHTML = '';
                    for (let i = 0; i < patternArray.length; i++) {
                        const backgroundcolor = i == barNumber ? "rgb(94, 94, 114)" : "rgb(24, 24, 26)"
                        innerHTML += `<li><div class="pattern-rack-item" data-bar-number="${i}" style="background-color: ${backgroundcolor};"><p style="margin-top: 8px; margin-bottom: 0;">${patternArray[i]}</p></div></li>`
                    }
                    patternRack.innerHTML = innerHTML;
                }
            };
            reader.readAsText(file);
        });
    });

    document.getElementById('manage-session-button').addEventListener('click', () => {
        const manualDiv = document.getElementById('session-manager-popup-box');
        manualDiv.style.display = 'flex';

        const sessionManagerDisplayList = document.getElementById('session-manager-list');

        const onMsg = (event) => {
            if (event.data && event.data.type === 'givenOscStructure') {
                try { uoSynthNode.port.removeEventListener('message', onMsg); } catch (e) {}
                Object.keys(event.data.data || {}).forEach(name => {
                    const listItem = document.createElement('li');
                    listItem.innerHTML = `<p id="sm-list-item-${name}" style="width: 172px; margin-left: 8px;">${name}</p> <div style="min-width: 130px;"> <button class="session-manager-button" name="session-manager-rename-button">Rename</button> <button class="session-manager-button" name="session-manager-delete-button">Delete</button> </div>`;
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
                            messageFunctions.deleteOsc(oscName, false);
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

                const clearSessionBtn = document.getElementById('clear-session-btn');
                clearSessionBtn.addEventListener('click', () => {
                    const promptText = document.getElementById('prompt-text');
                    const promptDiv = document.getElementById('prompt-input-elements');
                    promptText.innerText = 'Are you sure you want to clear the session?';
                    promptDiv.innerHTML = '<button id="session-manager-confirm-clear-button" class="session-manager-button" style="width: 80px;">Confirm</button> <button id="session-manager-cancel-clear-button" class="session-manager-button" style="width: 80px;">Cancel</button>';
                    
                    document.getElementById('session-manager-confirm-clear-button').addEventListener('click', () => {
                        sessionManagerDisplayList.innerHTML = '';
                        Object.keys(event.data.data || {}).forEach(name => { messageFunctions.deleteOsc(name, true); });
                        promptText.innerText = 'Lorem ipsum ..';
                        promptDiv.innerHTML = '';
                        manualDiv.style.display = 'none';
                        drawOscVisualVersion++
                        oscCtx.clearRect(0, 0, oscCvs.width, oscCvs.height);
                        
                        document.getElementsByName('synth-name-input')[0].value = '';
                        synthParamsInputHTMLforUOSynth[1].value = '';
                        synthParamsInputHTMLforUOSynth[2].value = '';
                        synthParamsInputHTMLforUOSynth[3].value = '';
                        synthParamsInputHTMLforUOSynth[4].value = '';
                        synthParamsInputHTMLforUOSynth[5].value = '';
                        synthParamsInputHTMLforUOSynth[6].value = '';
                        synthParamsInputHTMLforUOSynth[7].value = '';
                        synthParamsInputHTMLforUOSynth[8].value = '';
                        synthParamsInputHTMLforUOSynth[9].value = '';
                        synthParamsInputHTMLforUOSynth[10].value = '';
                        synthParamsInputHTMLforUOSynth[11].value = '';
                        selectedOscName = '';
                    });
                    document.getElementById('session-manager-cancel-clear-button').addEventListener('click', () => {
                        promptText.innerText = 'Lorem ipsum ..';
                        promptDiv.innerHTML = '';
                    });
                });
            }
        }
        uoSynthNode.port.addEventListener('message', onMsg);
        uoSynthNode.port.postMessage({ type: 'getOscStructure' });
    });

    document.getElementById("uosc-link").addEventListener('pointerdown', () => {
        showSequencer = false;
        document.getElementsByClassName("main")[0].style.display = "flex";
        document.getElementsByClassName("sequencer")[0].style.display = "none";
    });

    function resizeCanvas() {
        seqCvs.width = 0.56 * window.innerWidth - 24;
        seqCvs.height = 0.75 * window.innerHeight - 24;

        drawPianoRoll();
    }

    resizeCanvas();

    window.addEventListener('resize', resizeCanvas);
}, () => {
    alert("Server side error: Audio context initialization failed. Check if the audio permission is given to this page and reload the page. If that doesn't work check your connection and reload the page.");
});

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

// ---------------------- //
// Visualization section. //
// ---------------------- //

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
        const y = (-v * graphCvs.height + graphCvs.height);

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
visualSelect = document.getElementById("visualization-select").value;
if (!showSequencer) visualizerSelecter();

document.getElementById("visualization-select").addEventListener("change", (event) => {
    visualSelect = event.target.value;
    if (!showSequencer) visualizerSelecter();
});

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