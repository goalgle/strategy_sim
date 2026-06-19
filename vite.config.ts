import { defineConfig } from 'vite';

// GitHub Pages 프로젝트 사이트(goalgle.github.io/strategy_sim/)로 서비스 →
// 빌드 시에만 base를 repo 경로로. 로컬 dev는 '/' 유지.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/strategy_sim/' : '/',
  server: { port: 5173 },
  build: { target: 'es2022' },
}));
