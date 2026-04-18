self.addEventListener('message', (event) => {
    switch (event.data.type) {
        case 'synthesizeWavetable':
            const oscillatorPhazorInfo = event.data.oscillatorPhazorInfo;
            const tableLength = event.data.oscillatorPeriod;
            let wavetable;
            try {
                wavetable = new Float32Array(tableLength);
                const N = oscillatorPhazorInfo.partialCount;
                let maxAmp = 0;
                for (let sample = 0; sample < tableLength; sample++) {
                    let currentVal = 0;
                    const amps = oscillatorPhazorInfo.amps, phX = oscillatorPhazorInfo.phX, phY = oscillatorPhazorInfo.phY, cI = oscillatorPhazorInfo.cosInc, sI = oscillatorPhazorInfo.sinInc;
                    for (let k = 0; k < N; k++) {
                        currentVal += amps[k] * phY[k];
                        const xP = phX[k], yP = phY[k];
                        phX[k] = xP * cI[k] - yP * sI[k];
                        phY[k] = xP * sI[k] + yP * cI[k];
                    }
                    wavetable[sample] = currentVal;
                    if (Math.abs(currentVal) > maxAmp) maxAmp = Math.abs(currentVal);
                }
                self.postMessage({ type: 'givenWavetable', wavetable, oscName: event.data.oscName, maxAmp });
            } catch (error) {
                console.error('Error creating wavetable:', error);
                self.postMessage({ type: 'error', message: 'Failed to create wavetable. There will be no oscillator to export :(' });
                return;
            }
        break;
    }
});