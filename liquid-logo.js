export async function parseLogoImage(file) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  return new Promise((resolve, reject) => {
    if (!file || !ctx) {
      reject(new Error("Invalid file or context"));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";

      img.onload = function () {
          const MAX_SIZE = 1000;
          const MIN_SIZE = 500;
          
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          
          if (width > MAX_SIZE || height > MAX_SIZE || width < MIN_SIZE || height < MIN_SIZE) {
              if (width > height) {
                  const scale = width > MAX_SIZE ? MAX_SIZE / width : MIN_SIZE / width;
                  width = Math.round(width * scale);
                  height = Math.round(height * scale);
              } else {
                  const scale = height > MAX_SIZE ? MAX_SIZE / height : MIN_SIZE / height;
                  width = Math.round(width * scale);
                  height = Math.round(height * scale);
              }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          const shapeCanvas = document.createElement("canvas");
          shapeCanvas.width = width;
          shapeCanvas.height = height;
          const shapeCtx = shapeCanvas.getContext("2d");
          shapeCtx.drawImage(img, 0, 0, width, height);
          
          const shapeImageData = shapeCtx.getImageData(0, 0, width, height);
          const data = shapeImageData.data;
          const shapeMask = new Array(width * height).fill(false);
          
          for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                  const idx4 = (y * width + x) * 4;
                  const [r, g, b, a] = [data[idx4], data[idx4 + 1], data[idx4 + 2], data[idx4 + 3]];
                  shapeMask[y * width + x] = !((r === 255 && g === 255 && b === 255 && a === 255) || a === 0);
              }
          }
          const inside = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return false;
            return shapeMask[y * width + x];
          };

          const boundaryMask = new Array(width * height).fill(false);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              if (!shapeMask[idx]) continue;
              let isBoundary = false;
              for (let ny = y - 1; ny <= y + 1 && !isBoundary; ny++) {
                for (let nx = x - 1; nx <= x + 1 && !isBoundary; nx++) {
                  if (!inside(nx, ny)) isBoundary = true;
                }
              }
              if (isBoundary) boundaryMask[idx] = true;
            }
          }

          const u = new Float32Array(width * height).fill(0);
          const newU = new Float32Array(width * height).fill(0);
          const C = 0.01;
          const ITERATIONS = 300;

          const getU = (x, y, arr) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return 0;
            if (!shapeMask[y * width + x]) return 0;
            return arr[y * width + x];
          };

          for (let iter = 0; iter < ITERATIONS; iter++) {
            for (let y = 0; y < height; y++) {
              for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (!shapeMask[idx] || boundaryMask[idx]) {
                  newU[idx] = 0;
                  continue;
                }
                const sumN =
                  getU(x + 1, y, u) +
                  getU(x - 1, y, u) +
                  getU(x, y + 1, u) +
                  getU(x, y - 1, u);
                newU[idx] = (C + sumN) / 4;
              }
            }
            u.set(newU);
          }

          let maxVal = 0;
          for (let i = 0; i < width * height; i++) {
            if (u[i] > maxVal) maxVal = u[i];
          }

          const alpha = 2.0;
          const outImg = ctx.createImageData(width, height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = y * width + x;
              const px = idx * 4;
              if (!shapeMask[idx]) {
                outImg.data[px + 0] = 255;
                outImg.data[px + 1] = 255;
                outImg.data[px + 2] = 255;
                outImg.data[px + 3] = 255;
              } else {
                const raw = u[idx] / maxVal;
                const remapped = Math.pow(raw, alpha);
                const gray = 255 * (1 - remapped);
                outImg.data[px + 0] = gray;
                outImg.data[px + 1] = gray;
                outImg.data[px + 2] = gray;
                outImg.data[px + 3] = 255;
              }
            }
          }

          ctx.putImageData(outImg, 0, 0);

          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Failed to create PNG blob"));
              return;
            }
            resolve({
              imageData: outImg,
              pngBlob: blob
            });
          }, "image/png");
        };

        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = URL.createObjectURL(file);
      });
    }
export class LiquidLogo {
    constructor(canvas, imageData, params) {
        const gl = canvas.getContext("webgl2");
        if (!gl) {
            console.error("WebGL2 not supported");
            return;
        }
        
        const vertexSrc = `#version 300 es
    in vec2 a_position;
    out vec2 vUv;
    void main() {
      vUv = 0.5 * (a_position + 1.0);
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`;
        
        const fragSrc = `#version 300 es
        precision mediump float;

        in vec2 vUv;
        out vec4 fragColor;

        uniform sampler2D u_image_texture;
        uniform float u_time;
        uniform float u_ratio;
        uniform float u_img_ratio;
        uniform float u_patternScale;
        uniform float u_refraction;
        uniform float u_edge;
        uniform float u_patternBlur;
        uniform float u_liquid;

        #define PI 3.14159265358979323846

        float rand(vec2 co) {
          return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float noise(vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);

          float a = rand(i);
          float b = rand(i + vec2(1.0, 0.0));
          float c = rand(i + vec2(0.0, 1.0));
          float d = rand(i + vec2(1.0, 1.0));

          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(a, b, u.x) +
                 (c - a) * u.y * (1.0 - u.x) +
                 (d - b) * u.x * u.y;
        }
vec2 rotate(vec2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c) * p;
}

void main() {
  vec2 uv = vUv;
  uv -= 0.5;
  uv.x *= u_ratio;
  uv = rotate(uv, 0.3);
  uv += 0.5;

  vec2 imgUV = uv;
  imgUV -= 0.5;
  if (u_ratio > u_img_ratio) {
    imgUV.x = imgUV.x * u_ratio / u_img_ratio;
  } else {
    imgUV.y = imgUV.y * u_img_ratio / u_ratio;
  }
  imgUV += 0.5;
  imgUV.y = 1.0 - imgUV.y;

  float n = noise(uv * u_patternScale + vec2(u_time * 0.05, u_time * 0.1));
  float bump = n * u_liquid;
  float shift = bump * u_refraction;

  vec2 rUV = imgUV + vec2(shift, 0.0);
  vec2 gUV = imgUV;
  vec2 bUV = imgUV - vec2(shift, 0.0);

  float edge = texture(u_image_texture, imgUV).r;
  float r = texture(u_image_texture, rUV).r;
  float g = texture(u_image_texture, gUV).g;
  float b = texture(u_image_texture, bUV).b;

  vec3 base = vec3(r, g, b);
  base = mix(vec3(0.05), base, edge);

  float alpha = smoothstep(0.6, 0.95, edge);

  fragColor = vec4(base, alpha);
}
`;
        function createShader(type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                return null;
            }
            return shader;
        }

        const vertShader = createShader(gl.VERTEX_SHADER, vertexSrc);
        const fragShader = createShader(gl.FRAGMENT_SHADER, fragSrc);

        const program = gl.createProgram();
        gl.attachShader(program, vertShader);
        gl.attachShader(program, fragShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error("Shader link failed:", gl.getProgramInfoLog(program));
            return;
        }

        gl.useProgram(program);

        const uniforms = {
            u_time: gl.getUniformLocation(program, "u_time"),
            u_image_texture: gl.getUniformLocation(program, "u_image_texture"),
            u_ratio: gl.getUniformLocation(program, "u_ratio"),
            u_img_ratio: gl.getUniformLocation(program, "u_img_ratio"),
            u_edge: gl.getUniformLocation(program, "u_edge"),
            u_patternBlur: gl.getUniformLocation(program, "u_patternBlur"),
            u_patternScale: gl.getUniformLocation(program, "u_patternScale"),
            u_refraction: gl.getUniformLocation(program, "u_refraction"),
            u_liquid: gl.getUniformLocation(program, "u_liquid"),
        };

        const vertices = new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
             1,  1,
        ]);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const posLoc = gl.getAttribLocation(program, "a_position");
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            imageData.width,
            imageData.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            imageData.data
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

        gl.uniform1i(uniforms.u_image_texture, 0);
        gl.uniform1f(uniforms.u_img_ratio, imageData.width / imageData.height);
        gl.uniform1f(uniforms.u_ratio, canvas.width / canvas.height);

        gl.uniform1f(uniforms.u_edge, params.edge);
        gl.uniform1f(uniforms.u_patternBlur, params.patternBlur);
        gl.uniform1f(uniforms.u_patternScale, params.patternScale);
        gl.uniform1f(uniforms.u_refraction, params.refraction);
        gl.uniform1f(uniforms.u_liquid, params.liquid);

        let startTime = performance.now();

        function render() {
            const t = (performance.now() - startTime) * 0.001 * params.speed;
            gl.uniform1f(uniforms.u_time, t);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            requestAnimationFrame(render);
        }

        render();
    }
}
        
