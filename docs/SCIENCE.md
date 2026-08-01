# AV/01 scientific contract and provenance

> Expressive by design. Exact about the evidence.

I want AV/01 to be ambitious without borrowing authority it has not earned. This document states what each scene computes, where the method comes from, what question it can reasonably answer and what it must not claim.

The implementation described here was audited against the working tree on 1 August 2026. Bibliographic details were checked against primary papers, publisher records and current official standards on the same date. A citation means that a source informs a method. It does **not** mean that the authors, publisher or standards body tested or approved AV/01.

## Status language

- **Measured source** means a local file, shared tab/application or microphone routed into Web Audio. It does not mean calibrated acoustic measurement.
- **Synthetic preview** means the deterministic signal generated for the landing experience. It is not captured or measured audio and is never substituted for a missing live source.
- **Implemented** means the representation exists in code.
- **Internally validated** means that the core deterministic, signal-family, scene-routing, lifecycle and local-file export gates passed against the recorded controls. The five scene contracts have reached that narrow status on this candidate; live capture remains partial and long-session timing remains open.
- **External scientific approval** is not a status AV/01 claims. Internal validation is not peer review, perceptual validation, regulatory approval or metrological certification.

## The five-scene contract

| Claim ID | Scene | Implemented representation | Narrow question | Claim deliberately excluded | Release status |
| --- | --- | --- | --- | --- | --- |
| `AV01-SCI-001` | **Auditory Field** | A browser-defined, Blackman-windowed short-time spectrum summarized as 24 ERB-rate-spaced triangular-band RMS-like magnitudes | How does RMS-like spectral magnitude vary across those ERB-rate-spaced regions? | Source separation, instrument recognition, auditory masking or an individualized hearing model | Internally validated on the recorded local-file path |
| `AV01-SCI-002` | **Tonal Orbit** | Twelve-bin, octave-folded equal-tempered pitch-class energy | How concentrated is current spectral energy among twelve pitch classes? | Played-note, octave, tuning, chord or key identification | Internally validated on the recorded local-file path |
| `AV01-SCI-003` | **Temporal Scope** | Recent mono waveform plus RMS, sample peak, peak-to-RMS crest factor and zero-crossing rate | How is amplitude changing inside the current analysis window? | SPL, LUFS, stereo phase or laboratory oscilloscope measurement | Internally validated on the recorded local-file path |
| `AV01-SCI-004` | **Rhythm Lattice** | Positive log-spectral change followed by short-term autocorrelation of an onset-strength envelope | Does recent onset evidence repeat at a plausible pulse period? | Confirmed beat, downbeat, tempo, meter or groove | Internally validated on the recorded local-file path |
| `AV01-SCI-005` | **Recurrence Atlas** | Rolling non-negative cosine self-similarity of level-normalized, mean-centred log-ERB vectors | When has recent spectral shape resembled another recent moment? | Song-section, motif, source or structural-boundary recognition | Internally validated on the recorded local-file path |

The five mappings are authored visual interpretations. The papers below establish precedents for the signal representations, not for AV/01's colors, geometry or artistic meaning.

## What the scientific differentiator establishes

The differentiator is **representation-level separation**. Each scene declares a non-overlapping `FeatureFrame` family, WebGL contract tests prohibit cross-scene evidence access, and the Canvas fallback is reviewed against the same ownership map. The renderer contains no autonomous clock, procedural noise or random grain that could manufacture motion independently of the declared evidence.

Matched controls make that separation falsifiable:

| Controlled comparison | Expected change | Expected invariant |
| --- | --- | --- |
| Equal-RMS 375 Hz / 6 kHz tones | ERB-band position, centroid, rolloff and high-frequency ratio | Waveform RMS level |
| A3 / A4 | Auditory-band position and waveform period | Strongest octave-folded pitch class A |
| Waveform / polarity inverse | Displayed waveform sign | Magnitude-derived bands, RMS, peak and crest factor |
| Periodic / jittered transient trains with equal event count | Short-term onset-envelope autocorrelation evidence | Source event count |
| A–B–A / A–B–C spectral-shape sequences | Off-diagonal recent self-similarity | The declared per-frame ERB-shape representation |

Passing these controls establishes that AV/01 implements and routes five different signal representations under the declared fixtures. It does **not** establish perceptual preference, artistic superiority, listener agreement, external peer approval or calibrated measurement. Those require different study designs and remain explicitly outside the current approval.

## Shared analysis path

```text
measured source
     │
     ▼
Web Audio graph
     │
     ▼
AnalyserNode: mono downmix · 4096 most recent samples
     │
     ├── unwindowed time-domain samples
     └── Blackman window · DFT · float dB spectrum
          │
          ▼
50 Hz nominal feature snapshot
     │
     ├── ERB bands and spectral descriptors ─────────► Auditory Field
     ├── octave-folded pitch-class energy ───────────► Tonal Orbit
     ├── waveform and level descriptors ─────────────► Temporal Scope
     ├── onset strength and periodicity candidate ───► Rhythm Lattice
     └── rolling spectral self-similarity ───────────► Recurrence Atlas
```

The analysis clock is nominally 50 Hz and is separate from the display's `requestAnimationFrame()` clock. Browser scheduling, load, visibility and power policy can introduce jitter. Analysis stops while the instrument is paused or the document is hidden; elapsed steps are capped at 100 ms when it resumes. The HTML Standard defines [`setInterval()` timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers) as queued tasks and allows [rendering opportunities](https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering) to vary with refresh rate, performance and visibility, so neither analysis nor drawing should be described as a laboratory-stable clock.

For file playback, the media playhead coordinates transport and full-track export. Analysis windows come from the browser's current Web Audio signal, and stateful history resets across seeks, source changes, stop and replay-from-end. The renderers consume no autonomous presentation clock.

## Notation

- $x_t[n]$ is sample $n$ of the current mono time-domain window at analysis step $t$.
- $N$ is the analyser FFT size, currently 4096.
- $f_s$ is the active `AudioContext` sample rate.
- $A_t[k]$ is the non-negative linear amplitude reconstructed from analyser bin $k$.
- $B_t[b]$ is the raw RMS-like magnitude aggregated within ERB band $b$.
- $\epsilon=10^{-8}$ protects divisions and logarithms.

At 48 kHz, the 4096-sample window spans about 85.33 ms and each bin spans 11.71875 Hz. Those numbers change when the browser creates the audio context at another sample rate.

For bands and selected scalar descriptors, AV/01 uses an exponential attack/release envelope

$$
y_t=y_{t-1}+(r_t-y_{t-1})\left(1-e^{-\Delta t/\tau_t}\right),
\qquad
\tau_t=
\begin{cases}
35\text{ ms}, & r_t>y_{t-1},\\
220\text{ ms}, & r_t\le y_{t-1}.
\end{cases}
$$

On the first feature frame, the band, chroma, RMS/peak/crest and spectral-shape envelopes initialize from their raw values rather than ramping from zero. Onset strength starts at zero because no preceding spectrum exists.

## AV01-SCI-001 — Auditory Field

### Browser short-time spectrum

The short-time Fourier transform treats a signal through successive finite windows. AV/01 delegates the actual window and Fourier transform to `AnalyserNode`. The [W3C Web Audio API Recommendation](https://www.w3.org/TR/2021/REC-webaudio-20210617/), with the same analyser procedure carried into the [Web Audio API 1.1 First Public Working Draft](https://www.w3.org/TR/webaudio-1.1/), requires the analyser to downmix to mono, use the most recent `fftSize` frames, apply a Blackman window, transform the window, smooth its magnitude and convert the result to dB. AV/01 sets the analyser smoothing constant to zero so its own documented attack/release stage is the only temporal smoothing stage. The 1.1 publication is work in progress, not a W3C Recommendation.

The required Blackman window is

$$
w[n]=0.42-0.5\cos\left(\frac{2\pi n}{N}\right)+0.08\cos\left(\frac{4\pi n}{N}\right)
$$

and the browser computes the normalized transform

$$
X_t[k]=\frac{1}{N}\sum_{n=0}^{N-1}x_t[n]w[n]e^{-j2\pi kn/N}.
$$

`getFloatFrequencyData()` returns $D_t[k]=20\log_{10}|X_t[k]|$. AV/01 reconstructs a bounded linear amplitude for its visual feature bus:

$$
A_t[k]=
\begin{cases}
\operatorname{clamp}\left(10^{D_t[k]/20},0,1\right), & D_t[k]>-100\text{ dB and finite},\\
0, & \text{otherwise.}
\end{cases}
$$

This is a software floor on the analyser-magnitude scale, not an acoustic noise floor. Jont B. Allen and Lawrence R. Rabiner's [short-time Fourier analysis paper](https://doi.org/10.1109/PROC.1977.10770) is the signal-processing lineage; Web Audio defines the browser operation actually used here.

### ERB-spaced bands

Glasberg and Moore's work models the frequency-dependent bandwidth of auditory filters in normal-hearing listeners. AV/01 uses their ERB-rate approximation:

$$
E(f)=21.4\log_{10}(1+0.00437f),
$$

where $f$ is in hertz. It places 26 equally spaced points between 30 Hz and $\min(20\,000, f_s/2)$ on that scale. Consecutive triplets define 24 overlapping triangular filters $W_b[k]$:

$$
B_t[b]=\sqrt{\frac{\sum_k A_t[k]^2W_b[k]}{\sum_k W_b[k]}}.
$$

Each band then uses a 35 ms attack and 220 ms release. ERB spacing is a perceptually motivated frequency layout; it is not a complete cochlear, masking, loudness or hearing-loss model. The primary source is Brian R. Glasberg and Brian C. J. Moore, [“Derivation of Auditory Filter Shapes from Notched-Noise Data”](https://doi.org/10.1016/0378-5955(90)90170-T).

### Spectral descriptors

The scene also exposes three conventional spectral-shape descriptors:

$$
C_t^{\mathrm{raw}}=\frac{\sum_{k>0}f_kA_t[k]}{\sum_{k>0}A_t[k]}
$$

for spectral centroid; the first $f_r$ whose cumulative squared amplitude reaches 85% of total power for spectral rolloff; and

$$
H_t^{\mathrm{raw}}=\frac{\sum_{f_k\ge 3000}A_t[k]^2}{\sum_{k>0}A_t[k]^2}
$$

for the high-frequency power ratio.

All three raw descriptors use the shared 35 ms attack/220 ms release envelope before display. These are acoustic descriptors, not direct estimates of perceived brightness. Spectral centroid is an established correlate of a brightness dimension, but listener judgments also depend on context and spectrotemporal cues; see Charalampos Saitis and Kai Siedenburg, [“Brightness Perception for Musical Instrument Sounds”](https://doi.org/10.1121/10.0002275). AV/01 therefore names the values `spectralCentroidHz` and `highFrequencyRatio`, not “brightness.”

## AV01-SCI-002 — Tonal Orbit

For frequencies from 55 Hz to 5 kHz, AV/01 maps each spectral bin to a fractional twelve-tone equal-tempered pitch class with A4 fixed at 440 Hz:

$$
p(f)=\left(69+12\log_2\frac{f}{440}\right)\bmod 12.
$$

Squared amplitude is split linearly between the two adjacent pitch-class bins. For class $c$,

$$
P_t[c]=\sum_k A_t[k]^2\,L(c,p(f_k)),
\qquad
\bar P_t[c]=\frac{P_t[c]}{\sum_jP_t[j]},
$$

where $L$ is the linear interpolation weight. Each $\bar P_t[c]$ passes through the shared attack/release envelope to give $U_t[c]$, then the displayed vector is normalized again:

$$
\hat P_t[c]=\frac{U_t[c]}{\sum_jU_t[j]}.
$$

The concentration readout is normalized inverse Shannon entropy:

$$
Q_t=1-\frac{-\sum_c\hat P_t[c]\ln\hat P_t[c]}{\ln 12}.
$$

$Q_t$ approaches one when energy is concentrated and zero when it is evenly spread. The strongest bin is an argmax used to anchor the visual annotation. It is **not** a detected note.

When no included spectral power is available, all twelve bins and $Q_t$ are zero and there is no strongest class.

This octave-folded representation follows pitch-class profile and chromagram work such as Mark A. Bartsch and Gregory H. Wakefield, [“To Catch a Chorus: Using Chroma-Based Representations for Audio Thumbnailing”](https://doi.org/10.1109/ASPAA.2001.969531), and Emilia Gómez, [“Tonal Description of Polyphonic Audio for Music Content Processing”](https://doi.org/10.1287/ijoc.1040.0126).

AV/01 does not estimate tuning, suppress overtones, separate sources or compare against note/chord/key templates. Polyphonic mixtures, percussion, inharmonic sources, detuning, room response and microphone processing can all move the twelve bins. The only supported claim is octave-folded pitch-class energy under a fixed 12-TET/A440 mapping.

## AV01-SCI-003 — Temporal Scope

The current 4096-sample mono analyser window is reduced to 256 displayed waveform points by averaging each consecutive source block, then clamping each displayed point to the renderer's -1 to 1 range. The RMS, peak, crest and zero-crossing measurements use every finite time-domain sample exactly as Web Audio returns it; they are not clipped first, so an over-full-scale graph sample can produce a peak above 1 and a positive dBFS value. The scene also computes:

$$
\operatorname{RMS}^{\mathrm{raw}}_t=\sqrt{\frac{1}{N}\sum_{n=0}^{N-1}x_t[n]^2},
$$

$$
\operatorname{Peak}^{\mathrm{raw}}_t=\max_n|x_t[n]|,
\qquad
\operatorname{Crest}^{\mathrm{raw}}_t=\min\!\left(32,\frac{\operatorname{Peak}^{\mathrm{raw}}_t}{\max(\operatorname{RMS}^{\mathrm{raw}}_t,\epsilon)}\right),
$$

and

$$
\operatorname{ZCR}_t=\frac{1}{N-1}\sum_{n=1}^{N-1}
\mathbf{1}\!\left[
\begin{aligned}
&(x_t[n]\ge0\land x_t[n-1]<0)\\
&\lor(x_t[n]<0\land x_t[n-1]\ge0)
\end{aligned}
\right].
$$

The raw RMS, peak and crest values pass through the shared 35 ms attack/220 ms release envelope to produce the displayed $\operatorname{RMS}_t$, $\operatorname{Peak}_t$ and $\operatorname{Crest}_t$; the zero-crossing fraction is current-window data. RMS and zero-crossing rate are part of the low-level feature vocabulary documented by Geoffroy Peeters in [“A Large Set of Audio Features for Sound Description”](https://discussion.forum.ircam.fr/uploads/default/original/1X/ffa6a82f823873f864681994c271fb157e41a627.pdf). AV/01's crest factor is explicitly the waveform sample-peak-to-RMS ratio above; it is not Peeters's spectral crest descriptor.

AV/01 also reports a floor-bounded level from the smoothed RMS:

$$
L_{\mathrm{dBFS}}=
\begin{cases}
\max\!\left(-100,20\log_{10}(\operatorname{RMS}_t)\right), & \operatorname{RMS}_t>\epsilon,\\
-100, & \text{otherwise.}
\end{cases}
$$

against the normalized digital full-scale reference. This is a relative digital level. It is not:

- **LUFS/LKFS**, which requires the K-weighted and time-integrated algorithm in [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I) and, for EBU broadcast practice, the gating and programme rules in [EBU R 128](https://tech.ebu.ch/publications/r128);
- **true peak**, which requires inter-sample estimation rather than the current sample maximum; or
- **sound-pressure level**, which requires an acoustically calibrated microphone and measurement chain. [IEC 61672-1:2013](https://webstore.iec.ch/en/publication/5708) specifies performance requirements for sound level meters.

A browser digital signal cannot establish the acoustic level at a listener's ear.

## AV01-SCI-004 — Rhythm Lattice

### Positive log-spectral change

AV/01 measures only positive changes between consecutive linear spectra:

$$
F_t=\frac{1}{K-1}\sum_{k=1}^{K-1}
\max\left(0,\ln(1+32A_t[k])-\ln(1+32A_{t-1}[k])\right).
$$

An exponential baseline $\mu_t$ follows $F_t$:

$$
\mu_t=\mu_{t-1}+(F_t-\mu_{t-1})\left(1-e^{-\Delta t/\tau_t}\right),
\qquad
\tau_t=
\begin{cases}
0.9\text{ s}, & F_t>\mu_{t-1},\\
2.4\text{ s}, & F_t\le\mu_{t-1}.
\end{cases}
$$

The bounded onset target is

$$
O_t^{\mathrm{raw}}=1-\exp\left(
-\frac{\max(0,F_t-\mu_{t-1})}{\max(0.00025,1.5\mu_{t-1})}
\right),
$$

and the shared 35 ms attack/220 ms release envelope produces the displayed $O_t$. Spectral-flux-style functions are established onset evidence; see Juan Pablo Bello and colleagues, [“A Tutorial on Onset Detection in Music Signals”](https://doi.org/10.1109/TSA.2005.851998), and Simon Dixon, [“Onset Detection Revisited”](https://dafx.de/paper-archive/details/_kscRgr98aSFW4l-j1YJuA).

An onset-strength peak is evidence of spectral change. It is not necessarily a played note, percussion hit or musical beat.

### Short-term periodicity candidate

$O_t$ is sampled on a nominal 50 Hz grid into an eight-second ring buffer. After at least 2.5 seconds of evidence, AV/01 mean-centres the available envelope and evaluates normalized autocorrelation for lags corresponding to 50–200 BPM:

$$
R[\ell]=
\frac{\sum_{i=\ell}^{M-1}(O_i-\bar O)(O_{i-\ell}-\bar O)}
{\sqrt{\sum_{i=\ell}^{M-1}(O_i-\bar O)^2}
\sqrt{\sum_{i=\ell}^{M-1}(O_{i-\ell}-\bar O)^2}}.
$$

Only $R_+[\ell]=\max(0,R[\ell])$ is retained.

The periodicity buffer receives the smoothed $O_t$, while the event gate observes the unsmoothed adaptive target $O_t^{\mathrm{raw}}$. An armed detector marks a **transient candidate** when $O_t^{\mathrm{raw}}\ge0.28$ and rises more than 8% over its previous value. It then disarms until $O_t^{\mathrm{raw}}\le0.14$, so one attack cannot be counted repeatedly while it rises, without forcing the 220 ms display-release envelope to decay between fast events. At least four separated candidates must remain inside the rolling history before AV/01 exposes any periodicity candidate. This rejects mathematically periodic low-level modulation that has no separated transient sequence. The thresholds and count are operational false-positive controls, not claims that a candidate is a played note, percussion hit or beat.

The estimate refreshes every 250 ms. Correlations below 0.18 produce no candidate. Otherwise, the shortest lag within 96% of the strongest positive peak is preferred. A fast fractional period can be split between adjacent 50 Hz lag bins while an integer subharmonic aligns exactly—for example, 180 BPM spans about 16.67 frames while its 60 BPM third subharmonic spans exactly 50. To avoid silently reporting that grid artefact as the only answer, AV/01 also accepts the locally strongest bin around an integer divisor of the winning lag when that local peak retains at least 55% of the winning correlation. The selected lag is refined with three-point parabolic interpolation. These percentages, the transient trigger/re-arm thresholds and the four-candidate minimum are operational candidate-selection rules, not perceptual or music-theory constants. The BPM-equivalent display is

$$
P_{\mathrm{BPM}}=\frac{60\cdot 50}{\ell_{\mathrm{refined}}}.
$$

For the selected candidate's correlation $r_{\mathrm{selected}}$ and evidence count $M$, the heuristic evidence score is

$$
\operatorname{evidence}=\operatorname{clamp}\left(
\frac{r_{\mathrm{selected}}-0.18}{0.72}\min\left(1,\frac{M}{50\cdot6}\right),0,1
\right).
$$

Visual phase is anchored to the most recent transient candidate.

The score is a bounded engineering display of selected autocorrelation strength and history coverage. It is not a probability, calibrated confidence interval or estimate of correctness.

This is intentionally named **periodicity**, not tempo. Periodic onset envelopes commonly produce multiple plausible metrical lags; half-time, double-time and other interpretations cannot be resolved by a peak alone. Eric Scheirer's [tempo and beat analysis](https://doi.org/10.1121/1.421129), Daniel Ellis's [dynamic-programming beat tracker](https://doi.org/10.1080/09298210701653344) and Peter Grosche and Meinard Müller's [predominant local pulse work](https://doi.org/10.1109/TASL.2010.2096216) all use additional models beyond the short autocorrelation that AV/01 implements.

## AV01-SCI-005 — Recurrence Atlas

On the nominal feature schedule, every 125 ms AV/01 captures the current 24-band raw ERB vector. It first removes overall level:

$$
q_t[b]=
\begin{cases}
\dfrac{24B_t[b]}{\sum_j B_t[j]}, & \sum_jB_t[j]>\epsilon,\\
0, & \text{otherwise.}
\end{cases}
$$

then compresses, mean-centres and normalizes its shape:

$$
z_t[b]=\ln(1+8q_t[b]),
\qquad
v_t=
\begin{cases}
\dfrac{z_t-\bar z_t}{\lVert z_t-\bar z_t\rVert_2}, & \lVert z_t-\bar z_t\rVert_2>\epsilon,\\
0, & \text{otherwise.}
\end{cases}
$$

The rolling matrix stores

$$
S[i,j]=\operatorname{clamp}(v_i^\mathsf{T}v_j,0,1).
$$

Negative correlations are displayed as zero. The matrix is 64 by 64, so at the nominal 8 Hz update it contains up to eight seconds of recent history. For a populated, non-flat vector the diagonal is self-identity. Silence or any flat zero-variance vector is intentionally represented by the zero vector, so its diagonal cell is zero rather than manufactured evidence. To avoid presenting ordinary short-term continuity as a return, the `recurrence` summary ignores the newest two seconds and reports the largest similarity between the newest vector and older populated history. The full matrix still shows every populated comparison.

Jonathan Foote introduced time-by-time audio similarity images in [“Visualizing Music and Audio Using Self-Similarity”](https://doi.org/10.1145/319463.319472). Cosine-normalized self-similarity is further described by Jonathan Foote and Matthew Cooper in [“Media Segmentation Using Self-Similarity Decomposition”](https://doi.org/10.1117/12.476302).

AV/01 stops at the matrix. It does not apply Foote's later checkerboard novelty kernel, boundary selection, clustering or semantic labeling; see [“Automatic Audio Segmentation Using a Measure of Audio Novelty”](https://doi.org/10.1109/ICME.2000.869637). A bright off-diagonal cell means similar recent spectral shape. It does not mean “chorus,” “verse,” “motif” or even the same sound source.

## Current implementation constants

| Quantity | Current value | Meaning and boundary |
| --- | ---: | --- |
| Feature clock | 50 Hz nominal | Browser timer; not a guaranteed sampling clock |
| Maximum analysis step | 100 ms | Bounds elapsed state updates after delayed scheduling |
| Analyser window | 4096 samples | About 85.33 ms at 48 kHz |
| Frequency-bin spacing | $f_s/4096$ | About 11.72 Hz at 48 kHz |
| Byte-fallback mapping | -110 to -10 dB | `minDecibels`/`maxDecibels` scale only the legacy unsigned-byte fallback; float dB data are not clipped to this interval |
| Analyser smoothing | 0 | Feature bus owns temporal smoothing |
| Software spectrum floor | -100 dB analyser magnitude | Values below it become zero in the feature bus |
| Auditory bands | 24 triangular ERB bands | 30 Hz to $\min(20\text{ kHz}, f_s/2)$ |
| Feature attack/release | 35 / 220 ms | Applied to bands and selected scalar descriptors |
| Rolloff | 85% of spectral power | Acoustic spectral-shape descriptor |
| High-frequency ratio | Power at and above 3 kHz | Acoustic ratio, not perceived brightness |
| Waveform display | 256 block means | Drawn from the current 4096-sample mono window |
| Chroma | 12 bins, 55 Hz–5 kHz | 12-TET, A4 = 440 Hz, octave folded |
| Flux baseline rise/fall | 0.9 / 2.4 s | Adaptive reference for onset strength |
| Rhythm history | 50 Hz, up to 8 s | Minimum 2.5 s and four separated transient candidates; 0.28 trigger / 0.14 re-arm; 50–200 BPM-equivalent range |
| Rhythm refresh | 250 ms | Candidate update, not beat scheduling |
| Similarity history | 64 frames at 8 Hz | Up to 8 s; scalar recurrence excludes the newest 2 s |
| Silence threshold | -58 dBFS | Wakes at -52 dBFS; 450 ms hold before silence |
| Synthetic preview | 48 kHz nominal, seed 7, 118 BPM | Deterministic generated feature demonstration only |

The silence gate uses unsmoothed current-window RMS. It enters silence after remaining below -58 dBFS for 450 ms and wakes at -52 dBFS. This is a visual-settling state, not a claim that no sound is audible or acoustically present.

## Browser and capture limitations

### Mono analysis

The Web Audio specification requires `AnalyserNode` time-domain data to be downmixed to mono. AV/01 therefore does not analyze stereo width, inter-channel phase, balance or spatial audio cues, even when the source or exported audio has multiple channels.

### Microphone processing

AV/01 requests `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`, two channels, 48 kHz and 24-bit samples where supported. These are constraints, not guarantees. The [Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/) allows browser/device negotiation and processing. AV/01 reports the active track's browser-reported negotiated settings when they are exposed, but those target values can differ from measured performance and the signal may still be downmixed, resampled, filtered, gain-controlled or otherwise altered before it reaches Web Audio.

For local files, AV/01 uses two browser paths and labels them separately. A decoded `AudioBuffer` is used for the overview waveform, duration and memory checks; its displayed sample rate and channel count describe that overview decode only. Measured playback reaches the analysis graph through `HTMLMediaElement` → `MediaElementAudioSourceNode` → `AnalyserNode`, and the science method line reports the analyser's `AudioContext` sample rate. `decodeAudioData()` resamples to its context rate, and media playback can also be resampled by the browser, so neither value is presented as the file's original encoded sample rate. The analyser exposes mono time- and frequency-domain arrays even when the decoded overview has multiple channels.

The microphone input must not be described as raw, studio-accurate or calibrated.

### Level, loudness and sound pressure

`levelDbFs` is calculated from normalized browser samples. There is no K-weighting, programme integration, loudness gating, true-peak oversampling, microphone sensitivity calibration or pascal reference. The official distinction between signal level, loudness and sound pressure is reflected in [ITU-R BS.1771-1](https://www.itu.int/dms_pubrec/itu-r/rec/bs/r-rec-bs.1771-1-201201-i%21%21pdf-e.pdf).

### Timing and repeatability

The feature clock is decoupled from display FPS, but it still runs on the browser main thread. Timer delay, audio render-quantum alignment, device sample-rate conversion and tab visibility can change which current analyser window is read. The same file, settings and browser should produce stable visual behavior, but AV/01 does not promise sample-exact or cross-browser-identical analysis.

### Perceptual scope

ERB spacing is based on population-level normal-hearing auditory-filter estimates. It does not model individual thresholds, masking, equal loudness, hearing loss, room acoustics or playback equipment. The scenes are neither medical nor assistive diagnostic tools.

## Validation register

The following statuses summarize the recorded [release-candidate evidence](VALIDATION.md). They are internal engineering results, not completed external approval claims.

| Gate ID | Gate | What a pass would establish | Status |
| --- | --- | --- | --- |
| `AV01-VAL-001` | Deterministic unit fixtures | ERB transforms, pitch-class folding, entropy, periodicity and similarity match controlled numerical expectations | Pass · 34/34 tests |
| `AV01-VAL-002` | Signal-family fixtures | Browser sines, silent intervals, octave pairs, transient trains and repeated spectral shapes—plus unit-level impulse and silence controls—drive the intended descriptors without NaN/Infinity | Pass · nine deterministic browser fixtures plus unit controls |
| `AV01-VAL-003` | Scene-contract routing | Each scene consumes its declared primary representation and exposes the stated limitation | Pass · WebGL isolation tests plus optimized-browser Canvas fallback signal gates |
| `AV01-VAL-004` | Browser integration | The tested path reports coherent sample rate, FFT size, source provenance and renderer state | Partial · 3/3 Chromium end-to-end gates plus recorded Canvas 2D and WebGL 2 local-file paths pass; live capture not exercised |
| `AV01-VAL-005` | Reset/seek/source lifecycle | Stateful rhythm and similarity history reset instead of leaking across discontinuities or sources | Pass · source, stop, replay and export restoration |
| `AV01-VAL-006` | Export provenance | Preview and recording use the same measured feature frames and scene contract | Pass · full 1280 × 720 WebGL WebM render |
| `AV01-VAL-007` | Long-session timing | Nominal feature cadence, hidden-tab behavior and bounded resume steps remain coherent under load | Not completed for this candidate |
| `AV01-VAL-008` | Perceptual study | Listeners interpret mappings consistently under a preregistered protocol | Not performed |
| `AV01-VAL-009` | Independent peer review | External specialists review methods, claims, fixtures and results | Not performed |
| `AV01-VAL-010` | Metrological certification | A qualified body verifies a calibrated measurement function against a relevant standard | Not applicable to the current visual instrument; not performed |

Passing the internal gates would demonstrate implementation consistency. It would not make AV/01 a BS.1770 loudness meter, IEC 61672 sound-level meter, certified beat tracker, chord/key recognizer or scientifically validated perceptual model.

## Primary source registry

These stable IDs are used by the scene definitions and this document.

- `w3c-webaudio-1.1` — [W3C Web Audio API Recommendation](https://www.w3.org/TR/2021/REC-webaudio-20210617/), 17 June 2021, paired with the [Web Audio API 1.1 First Public Working Draft](https://www.w3.org/TR/webaudio-1.1/), 5 November 2024. The analyser procedure used by AV/01 appears in both; the 1.1 document remains work in progress.
- `allen-rabiner-1977` — Jont B. Allen and Lawrence R. Rabiner, “A Unified Approach to Short-Time Fourier Analysis and Synthesis,” *Proceedings of the IEEE* 65(11), 1558–1564, 1977. [DOI 10.1109/PROC.1977.10770](https://doi.org/10.1109/PROC.1977.10770).
- `glasberg-moore-1990` — Brian R. Glasberg and Brian C. J. Moore, “Derivation of Auditory Filter Shapes from Notched-Noise Data,” *Hearing Research* 47(1–2), 103–138, 1990. [DOI 10.1016/0378-5955(90)90170-T](https://doi.org/10.1016/0378-5955(90)90170-T).
- `peeters-2004` — Geoffroy Peeters, “A Large Set of Audio Features for Sound Description (Similarity and Classification) in the CUIDADO Project,” IRCAM–Centre Pompidou Technical Report, version 1.0, 2004. [Official IRCAM-hosted report PDF](https://discussion.forum.ircam.fr/uploads/default/original/1X/ffa6a82f823873f864681994c271fb157e41a627.pdf).
- `bartsch-wakefield-2001` — Mark A. Bartsch and Gregory H. Wakefield, “To Catch a Chorus: Using Chroma-Based Representations for Audio Thumbnailing,” *IEEE Workshop on Applications of Signal Processing to Audio and Acoustics*, 15–18, 2001. [DOI 10.1109/ASPAA.2001.969531](https://doi.org/10.1109/ASPAA.2001.969531).
- `gomez-2006` — Emilia Gómez, “Tonal Description of Polyphonic Audio for Music Content Processing,” *INFORMS Journal on Computing* 18(3), 294–304, 2006. [DOI 10.1287/ijoc.1040.0126](https://doi.org/10.1287/ijoc.1040.0126).
- `bello-2005` — Juan Pablo Bello, Laurent Daudet, Samer Abdallah, Chris Duxbury, Mike Davies and Mark B. Sandler, “A Tutorial on Onset Detection in Music Signals,” *IEEE Transactions on Speech and Audio Processing* 13(5), 1035–1047, 2005. [DOI 10.1109/TSA.2005.851998](https://doi.org/10.1109/TSA.2005.851998).
- `dixon-2006` — Simon Dixon, “Onset Detection Revisited,” *Proceedings of the 9th International Conference on Digital Audio Effects*, 133–137, 2006. [Official DAFx archive](https://dafx.de/paper-archive/details/_kscRgr98aSFW4l-j1YJuA).
- `scheirer-1998` — Eric D. Scheirer, “Tempo and Beat Analysis of Acoustic Musical Signals,” *Journal of the Acoustical Society of America* 103(1), 588–601, 1998. [DOI 10.1121/1.421129](https://doi.org/10.1121/1.421129).
- `foote-1999` — Jonathan Foote, “Visualizing Music and Audio Using Self-Similarity,” *Proceedings of the Seventh ACM International Conference on Multimedia*, 77–80, 1999. [DOI 10.1145/319463.319472](https://doi.org/10.1145/319463.319472).
- `foote-2000` — Jonathan Foote, “Automatic Audio Segmentation Using a Measure of Audio Novelty,” *2000 IEEE International Conference on Multimedia and Expo*, volume 1, 452–455, 2000. [DOI 10.1109/ICME.2000.869637](https://doi.org/10.1109/ICME.2000.869637).

Additional primary papers and official standards used to define boundaries:

- Jonathan T. Foote and Matthew L. Cooper, “Media Segmentation Using Self-Similarity Decomposition,” *Proceedings of SPIE* 5021, 167–175, 2003. [DOI 10.1117/12.476302](https://doi.org/10.1117/12.476302).
- Daniel P. W. Ellis, “Beat Tracking by Dynamic Programming,” *Journal of New Music Research* 36(1), 51–60, 2007. [DOI 10.1080/09298210701653344](https://doi.org/10.1080/09298210701653344).
- Peter Grosche and Meinard Müller, “Extracting Predominant Local Pulse Information from Music Recordings,” *IEEE Transactions on Audio, Speech, and Language Processing* 19(6), 1688–1701, 2011. [DOI 10.1109/TASL.2010.2096216](https://doi.org/10.1109/TASL.2010.2096216).
- Charalampos Saitis and Kai Siedenburg, “Brightness Perception for Musical Instrument Sounds: Relation to Timbre Dissimilarity and Source-Cause Categories,” *Journal of the Acoustical Society of America* 148(4), 2256–2266, 2020. [DOI 10.1121/10.0002275](https://doi.org/10.1121/10.0002275).
- [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/), current specification.
- [WHATWG HTML Standard: event loops and rendering opportunities](https://html.spec.whatwg.org/multipage/webappapis.html), living standard.
- [ITU-R BS.1770-5](https://www.itu.int/rec/R-REC-BS.1770-5-202311-I), “Algorithms to Measure Audio Programme Loudness and True-Peak Audio Level,” November 2023.
- [EBU R 128, version 5.0](https://tech.ebu.ch/publications/r128), “Loudness Normalisation and Permitted Maximum Level of Audio Signals,” November 2023.
- [ITU-R BS.1771-1](https://www.itu.int/dms_pubrec/itu-r/rec/bs/r-rec-bs.1771-1-201201-i%21%21pdf-e.pdf), “Requirements for Loudness and True-Peak Indicating Meters,” 2012.
- [IEC 61672-1:2013](https://webstore.iec.ch/en/publication/5708), “Electroacoustics — Sound Level Meters — Part 1: Specifications.”
