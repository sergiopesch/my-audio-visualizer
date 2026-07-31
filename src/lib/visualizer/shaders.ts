export const FULLSCREEN_VERTEX_SHADER = `#version 300 es
precision highp float;

out vec2 vUv;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const SPECTRAL_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSeed;
uniform int uScene;
uniform float uBands[24];
uniform float uWave[64];
uniform vec4 uAudio;
uniform vec4 uSpectral;
uniform vec4 uSettings;
uniform float uFlashSafe;
uniform vec3 uBackground;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uAccent;

#define PI 3.14159265359
#define TAU 6.28318530718

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float hash21(vec2 point) {
  point = fract(point * vec2(123.34, 456.21));
  point += dot(point, point + 45.32 + uSeed * 0.013);
  return fract(point.x * point.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotation = mat2(0.82, -0.57, 0.57, 0.82);
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * valueNoise(point);
    point = rotation * point * 2.03 + 11.7;
    amplitude *= 0.5;
  }
  return value;
}

float sampleBand(float position) {
  float scaled = saturate(position) * 23.0;
  int lower = int(floor(scaled));
  int upper = min(lower + 1, 23);
  return mix(uBands[lower], uBands[upper], fract(scaled));
}

float sampleWave(float position) {
  float scaled = saturate(position) * 63.0;
  int lower = int(floor(scaled));
  int upper = min(lower + 1, 63);
  return mix(uWave[lower], uWave[upper], fract(scaled));
}

vec3 colorRamp(float position) {
  float t = saturate(position);
  vec3 first = mix(uPrimary, uSecondary, smoothstep(0.0, 0.58, t));
  return mix(first, uAccent, smoothstep(0.54, 1.0, t));
}

vec2 stagePoint() {
  vec2 point = vUv - 0.5;
  point.x *= uResolution.x / max(1.0, uResolution.y);
  return point;
}

vec3 renderField(vec2 point) {
  float rms = uAudio.x;
  float peak = uAudio.y;
  float flux = uAudio.z;
  float pulse = uAudio.w;
  float spectralCenter = uSpectral.x;
  float detail = uSettings.w;
  float time = uTime * uSettings.y * 0.24;

  float bass = (sampleBand(0.02) + sampleBand(0.08) + sampleBand(0.14)) / 3.0;
  float mids = (sampleBand(0.34) + sampleBand(0.48) + sampleBand(0.62)) / 3.0;
  float air = (sampleBand(0.78) + sampleBand(0.9) + sampleBand(1.0)) / 3.0;

  float angle = -0.16 + sin(time * 0.31) * 0.08;
  mat2 rotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  vec2 warped = rotation * point;
  warped.x += sin(warped.y * 3.4 + time + bass * 1.8) * (0.08 + mids * 0.12);
  warped.y += cos(warped.x * 2.8 - time * 0.7) * (0.05 + air * 0.09);

  float firstWarp = fbm(warped * (1.8 + detail * 1.8) + vec2(time, -time * 0.61));
  float secondWarp = fbm(warped * 3.1 + vec2(-time * 0.47, time * 0.82) + firstWarp * 2.0);
  float ribbonCoordinate = warped.y + (firstWarp - 0.5) * (0.62 + mids * 0.44);
  float ribbons = 0.0;
  for (int line = 0; line < 4; line++) {
    float lane = float(line) - 1.5;
    float center = lane * (0.095 + bass * 0.018);
    float distanceToLane = abs(ribbonCoordinate - center - sin(warped.x * (3.2 + lane) + time * 1.3 + lane) * 0.035);
    float width = 0.012 + rms * 0.019 + float(line == 1 || line == 2) * 0.006;
    ribbons += width / (distanceToLane + width) * (0.34 + 0.12 * float(line));
  }

  float haloDistance = length(point * vec2(0.78, 1.0));
  float halo = exp(-haloDistance * (3.4 - bass * 0.8)) * (0.16 + bass * 0.5);
  float interference = 0.5 + 0.5 * sin((secondWarp + point.x * 0.36) * (17.0 + detail * 13.0) + time * 2.0);
  float shards = pow(interference, 7.0) * (0.08 + air * 0.44 + flux * 0.22);
  float shock = exp(-abs(haloDistance - (0.28 + pulse * 0.15)) * 52.0) * pulse * 0.34;

  float colorPosition = saturate(spectralCenter * 0.64 + secondWarp * 0.55 + point.x * 0.08 + 0.1);
  vec3 color = colorRamp(colorPosition) * (ribbons * (0.72 + peak * 0.36));
  color += mix(uSecondary, uPrimary, firstWarp) * (halo + shards);
  color += uAccent * shock;
  return color;
}

vec3 renderOrbit(vec2 point) {
  float rms = uAudio.x;
  float flux = uAudio.z;
  float pulse = uAudio.w;
  float spectralCenter = uSpectral.x;
  float detail = uSettings.w;
  float time = uTime * uSettings.y * 0.18;

  float radius = length(point);
  float angle = atan(point.y, point.x);
  float normalizedAngle = fract(angle / TAU + 0.5 + time * 0.035);
  float mirrored = abs(normalizedAngle * 2.0 - 1.0);
  float spectrum = sampleBand(mirrored);
  float reverseSpectrum = sampleBand(1.0 - mirrored);
  float petals = 0.5 + 0.5 * cos(angle * (6.0 + floor(detail * 7.0)) - time * 1.7);
  float bass = (sampleBand(0.02) + sampleBand(0.08) + sampleBand(0.15)) / 3.0;

  float targetRadius = 0.215 + bass * 0.095 + spectrum * (0.13 + detail * 0.06) + petals * flux * 0.035;
  float ringDistance = abs(radius - targetRadius);
  float ring = (0.009 + spectrum * 0.015) / (ringDistance + 0.009);
  ring *= smoothstep(0.02, 0.19, radius);

  float innerTarget = 0.104 + reverseSpectrum * 0.045 + sin(angle * 12.0 + time) * 0.006;
  float inner = 0.006 / (abs(radius - innerTarget) + 0.006);
  float radialTicks = pow(0.5 + 0.5 * cos(angle * (48.0 + floor(detail * 48.0))), 11.0);
  radialTicks *= smoothstep(targetRadius + 0.09, targetRadius, radius) * smoothstep(0.08, 0.16, radius);
  radialTicks *= 0.12 + spectrum * 0.64;

  float shockRadius = 0.34 + fract(time * 0.11 + uSeed * 0.017) * 0.42;
  float shock = exp(-abs(radius - shockRadius) * 85.0) * pulse * (0.15 + flux * 0.35);
  float core = exp(-radius * (10.0 - bass * 2.5)) * (0.22 + rms * 0.9);
  float orbitDust = pow(hash21(floor((point + 1.0) * 180.0)), 18.0);
  orbitDust *= exp(-abs(radius - 0.42) * 8.0) * (0.06 + uSpectral.z * 0.42);

  vec3 color = colorRamp(saturate(normalizedAngle + spectralCenter * 0.24)) * ring;
  color += uPrimary * inner * 0.72;
  color += mix(uSecondary, uAccent, spectrum) * radialTicks;
  color += uAccent * shock;
  color += uPrimary * core;
  color += mix(uPrimary, uSecondary, normalizedAngle) * orbitDust;
  return color;
}

vec3 renderTrace(vec2 point) {
  float rms = uAudio.x;
  float peak = uAudio.y;
  float flux = uAudio.z;
  float crest = saturate(uAudio.y * 0.78 + uAudio.x * 0.22);
  float detail = uSettings.w;
  float time = uTime * uSettings.y * 0.2;
  vec2 uv = vUv;

  float waveform = sampleWave(uv.x);
  float y = 0.5 + waveform * (0.17 + rms * 0.17);
  float primaryLine = 0.0055 / (abs(uv.y - y) + 0.0055);
  float ghostOne = 0.003 / (abs(uv.y - (0.5 + waveform * 0.1 + sin(uv.x * 18.0 + time) * flux * 0.025)) + 0.003);
  float ghostTwo = 0.002 / (abs(uv.y - (0.5 - waveform * 0.065 - cos(uv.x * 12.0 - time) * peak * 0.018)) + 0.002);

  float columns = mix(20.0, 64.0, detail);
  float columnIndex = floor(uv.x * columns);
  float bandPosition = columnIndex / max(1.0, columns - 1.0);
  float spectrum = sampleBand(bandPosition);
  float barEdge = 0.82 - spectrum * (0.25 + rms * 0.34);
  float bar = smoothstep(barEdge, barEdge - 0.012, uv.y) * smoothstep(0.495, 0.505, fract(uv.x * columns));
  bar *= 0.13 + spectrum * 0.38;

  float scan = exp(-abs(fract(uv.y * (9.0 + detail * 14.0) - time * 0.2) - 0.5) * 34.0) * 0.035;
  float cursor = exp(-abs(uv.x - fract(time * 0.07 + uSeed * 0.021)) * 180.0) * flux * 0.22;
  vec3 color = colorRamp(saturate(uv.x * 0.78 + uSpectral.x * 0.32)) * primaryLine;
  color += uSecondary * ghostOne * (0.2 + crest * 0.18);
  color += uAccent * ghostTwo * (0.12 + flux * 0.22);
  color += mix(uSecondary, uPrimary, bandPosition) * bar;
  color += uPrimary * scan;
  color += uAccent * cursor;
  color *= 0.82 + 0.18 * smoothstep(0.0, 0.08, abs(point.x));
  return color;
}

vec3 renderLattice(vec2 point) {
  float rms = uAudio.x;
  float peak = uAudio.y;
  float flux = uAudio.z;
  float pulse = uAudio.w;
  float detail = uSettings.w;
  float time = uTime * uSettings.y * 0.18;
  float aspect = uResolution.x / max(1.0, uResolution.y);

  float rows = mix(17.0, 43.0, detail);
  vec2 gridScale = vec2(rows * aspect, rows);
  vec2 gridPosition = vUv * gridScale;
  vec2 cellId = floor(gridPosition);
  vec2 cellLocal = fract(gridPosition) - 0.5;
  vec2 normalizedCell = (cellId + 0.5) / gridScale - 0.5;
  normalizedCell.x *= aspect;
  float distanceFromCenter = length(normalizedCell);
  float angle = atan(normalizedCell.y, normalizedCell.x);
  float angularBand = sampleBand(abs(fract(angle / TAU + 0.5) * 2.0 - 1.0));
  float radialBand = sampleBand(saturate(distanceFromCenter * 1.7));
  float spectralEnergy = angularBand * 0.65 + radialBand * 0.35;

  float bass = (sampleBand(0.02) + sampleBand(0.08) + sampleBand(0.15)) / 3.0;
  float reach = 0.25 + bass * 0.3 + sqrt(max(rms, 0.0)) * 0.18;
  float wave = sin(distanceFromCenter * 41.0 - time * 4.0) * (0.014 + pulse * 0.035);
  float activation = smoothstep(reach + spectralEnergy * 0.17 + wave, reach - 0.065, distanceFromCenter);
  float edgeNoise = hash21(cellId + uSeed) * flux * 0.22;
  activation *= mix(0.58, 1.0, smoothstep(0.018, 0.11, spectralEnergy + edgeNoise + peak * 0.08));

  float cellDistance = max(abs(cellLocal.x), abs(cellLocal.y));
  float block = 1.0 - smoothstep(0.39, 0.49, cellDistance);
  float rim = smoothstep(0.33, 0.43, cellDistance) * (1.0 - smoothstep(0.43, 0.49, cellDistance));
  float brightness = activation * block * (0.48 + spectralEnergy * 0.92 + peak * 0.18);
  float shock = exp(-abs(distanceFromCenter - (0.24 + pulse * 0.32)) * 48.0) * pulse * block;
  float ripplePhase = fract(distanceFromCenter * 4.4 - time * 0.16);
  float outerRipple = exp(-abs(ripplePhase - 0.5) * 18.0)
    * (0.075 + pulse * 0.22)
    * block
    * smoothstep(0.78, 0.08, distanceFromCenter);

  vec3 color = colorRamp(saturate(distanceFromCenter * 1.45 + angularBand * 0.26)) * brightness;
  color += uPrimary * rim * activation * 0.13;
  color += uAccent * shock * 0.55;
  color += mix(uSecondary, uAccent, angularBand) * outerRipple * (0.46 + spectralEnergy * 0.72);
  return color;
}

vec3 renderContour(vec2 point) {
  float rms = uAudio.x;
  float flux = uAudio.z;
  float pulse = uAudio.w;
  float spectralCenter = uSpectral.x;
  float detail = uSettings.w;
  float time = uTime * uSettings.y * 0.14;

  vec2 warped = point;
  float radius = length(point);
  warped += vec2(
    sin(point.y * 3.0 + time) * (0.08 + rms * 0.12),
    cos(point.x * 2.7 - time * 0.8) * (0.06 + flux * 0.1)
  );
  float terrain = fbm(warped * (2.2 + detail * 2.6) + vec2(time * 0.7, -time * 0.46));
  terrain += (sampleBand(saturate(vUv.x)) - 0.5) * (0.18 + rms * 0.24);
  terrain += sin(radius * 24.0 - time * 3.0) * pulse * 0.035;
  float contourCount = 7.0 + detail * 15.0;
  float contourCell = abs(fract(terrain * contourCount) - 0.5);
  float contour = 1.0 - smoothstep(0.018, 0.075 - detail * 0.018, contourCell);
  float majorCell = abs(fract(terrain * contourCount * 0.25) - 0.5);
  float major = 1.0 - smoothstep(0.02, 0.095, majorCell);
  float centerGlow = exp(-radius * 3.8) * (0.08 + rms * 0.46);
  float shock = exp(-abs(radius - (0.16 + pulse * 0.5)) * 54.0) * pulse * 0.3;

  vec3 color = colorRamp(saturate(terrain * 0.72 + spectralCenter * 0.36)) * contour * (0.16 + rms * 0.58);
  color += uPrimary * major * (0.08 + flux * 0.16);
  color += uSecondary * centerGlow;
  color += uAccent * shock;
  return color;
}

void main() {
  vec2 point = stagePoint();
  vec3 color;
  if (uScene == 1) {
    color = renderOrbit(point);
  } else if (uScene == 2) {
    color = renderTrace(point);
  } else if (uScene == 3) {
    color = renderLattice(point);
  } else if (uScene == 4) {
    color = renderContour(point);
  } else {
    color = renderField(point);
  }

  float silence = uSpectral.w;
  float vignette = smoothstep(1.15, 0.18, length(point * vec2(0.72, 0.92)));
  float intensity = uSettings.x;
  float bloom = uSettings.z;
  color *= mix(0.74, 1.3, intensity) * mix(0.82, 1.22, bloom);
  color *= 0.62 + vignette * 0.38;
  color *= mix(1.0, 0.72, silence);

  float grainRate = mix(16.0, 7.0, uFlashSafe);
  float grain = hash21(gl_FragCoord.xy + floor(uTime * grainRate * uSettings.y)) - 0.5;
  color += grain * mix(0.022, 0.008, uFlashSafe);
  color = color / (vec3(1.0) + color * mix(0.38, 0.58, uFlashSafe));
  color = pow(max(color, vec3(0.0)), vec3(0.92));
  color = mix(uBackground, color + uBackground * 0.34, saturate(vignette + length(color)));
  outColor = vec4(color, 1.0);
}
`;
