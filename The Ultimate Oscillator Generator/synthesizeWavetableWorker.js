const LUTSinusoidal = new Float32Array(96000);

for (let sample = 0; sample < LUTSinusoidal.length; sample++) {
    LUTSinusoidal[sample] = Math.sin(sample / LUTSinusoidal.length * 2 * Math.PI);
}

const lerp = (a, b, t) => a + (b - a) * t;

self.addEventListener('message', (event) => {
    console.log('From wavetable worker: Message from Main Thread: ', event.data);

    switch (event.data.type) {
        case 'testing':
            self.postMessage({ type: 'testingResponse', data: LUTSinusoidal });
            break;
        case 'synthesizeWavetable':
            const oscillatorPhazorInfo = event.data.oscillatorPhazorInfo;
            const tableLength = event.data.oscillatorPeriod;
            let wavetable;
            try {
                wavetable = new Float32Array(tableLength);
                console.log('From wavetable worker: Wavetable synthesis started; table size: ', tableLength, 'samples', toUnitBytes(tableLength * 2), toHMSMS(tableLength / 48000));
                if (tableLength / 48000 >= 30) self.postMessage({ type: 'alert', message: `Wavetable synthesis started; table size: ${tableLength} samples (${toUnitBytes(tableLength * 2)}), duration: ${toHMSMS(tableLength / 48000)}` });
                const N = oscillatorPhazorInfo.partialCount;
                let maxAmp = 0;
                const startTime = performance.now();
                let estimateStartTime = performance.now();
                let estimateEndTime;
                let shortTimeAvgSampleTime;
                let avgSampleTime = 0;
                let avgSampleTimeTerms = 0;
                let estimateTime;
                const loggedEstimateTimes = [];
                for (let sample = 0; sample < tableLength; sample++) {
                    if (sample > 47999 && sample % 48000 === 0) {
                        estimateEndTime = performance.now();
                        shortTimeAvgSampleTime = (estimateEndTime - estimateStartTime) / 48000;
                        avgSampleTimeTerms++;
                        avgSampleTime += (shortTimeAvgSampleTime - avgSampleTime) / avgSampleTimeTerms;
                        estimateTime = avgSampleTime * (tableLength - sample) * 0.001;
                        loggedEstimateTimes.push(estimateTime);
                        estimateStartTime = performance.now();
                    }
                    let currentVal = 0;
                    const amps = oscillatorPhazorInfo.amps, phX = oscillatorPhazorInfo.phX, phY = oscillatorPhazorInfo.phY, cI = oscillatorPhazorInfo.cosInc, sI = oscillatorPhazorInfo.sinInc;
                    for (let k = 0; k < N; k++) {
                        currentVal += amps[k] * phY[k];
                        const xP = phX[k], yP = phY[k];
                        const mag = xP * xP + yP * yP;
                        phX[k] = (xP * cI[k] - yP * sI[k]);
                        phY[k] = (xP * sI[k] + yP * cI[k]);
                        if (Math.abs(1 - mag) > 1e-6) {
                            const normFactpr = 1 / Math.sqrt(mag);
                            phX[k] *= normFactpr;
                            phY[k] *= normFactpr;
                        }
                    }
                    wavetable[sample] = currentVal;
                    if (Math.abs(currentVal) > maxAmp) maxAmp = Math.abs(currentVal);
                }
                const endTime = performance.now();
                const completeTime = (endTime - startTime) / 1000;
                const errorTerm = ((completeTime * 0.5 - loggedEstimateTimes[Math.ceil(loggedEstimateTimes.length * 0.5)]) + (completeTime * 0.25 - loggedEstimateTimes[Math.ceil(loggedEstimateTimes.length * 0.25)]) + (completeTime * 0.75 - loggedEstimateTimes[Math.ceil(loggedEstimateTimes.length * 0.75)]) + (completeTime * 0.1 - loggedEstimateTimes[Math.ceil(loggedEstimateTimes.length * 0.1)])) / 4;
                console.log(`Wavetable synthesis completed in ${toHMSMS(completeTime)}. Average Sample Generation Time: ${avgSampleTime.toFixed(4)} ms. Estimation error: ${errorTerm}`);
                self.postMessage({ type: 'givenWavetable', wavetable, oscName: event.data.oscName, maxAmp }, [wavetable.buffer]);
            } catch (error) {
                console.error('Error creating wavetable:', error);
                self.postMessage({ type: 'error', message: 'Failed to create wavetable. There will be no oscillator to export :(' });
                return;
            }
        break;
    }
});

function toHMSMS(time) {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    const milliseconds = Math.round((time - Math.floor(time)) * 1000);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    } else if (minutes > 0) {
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    } else {
        return `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
    }
}

function toUnitBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let unitIndex = 0;
    let value = bytes;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(2)} ${units[unitIndex]}`;
}