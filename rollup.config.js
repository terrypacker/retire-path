import terser from '@rollup/plugin-terser'
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import copy from 'rollup-plugin-copy-watch';
const isWatching = process.env.ROLLUP_WATCH === 'true';

export default [
  // ESM
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      terser(),
      nodeResolve(),
      commonjs()
    ]
  },

  // CJS
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [
      terser(),
      nodeResolve(),
      commonjs()
    ]
  },

  // UMD (browser)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'RetirePath',
      sourcemap: true
    },
    plugins: [
        terser(),
        nodeResolve(),
        commonjs(),
        !isWatching && copy({
          targets: [
            { src: 'assets/**/*', dest: 'dist/assets' },
            { src: '*.html', dest: 'dist' }
          ]
        }),
        isWatching && copy({
          watch: ['assets', '*.html'],
          targets: [
            { src: 'assets/**/*', dest: 'dist/assets' },
            { src: '*.html', dest: 'dist' }
          ]
        })
    ].filter(Boolean)
  }
];
