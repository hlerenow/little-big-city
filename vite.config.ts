import { defineConfig } from 'vite';

export default defineConfig({
  // 项目根目录
  root: '.',
  
  // public 目录路径（存放不需要打包的静态资源）
  publicDir: 'public',
  
  // 定义全局常量替换
  define: {
    'process.env': {},
    'process.version': JSON.stringify(''),
    'process.versions': JSON.stringify({}),
    global: 'globalThis',
  },
  
  // 开发服务器配置
  server: {
    port: 3000,
    open: true,
    host: true
  },
  
  // 构建配置
  build: {
    outDir: 'dist',
    sourcemap: true,
    // 清空输出目录
    emptyOutDir: true,
    rollupOptions: {
      input: './index.html',
      output: {
        // 入口文件命名
        entryFileNames: 'assets/[name]-[hash].js',
        // chunk 文件命名
        chunkFileNames: 'assets/[name]-[hash].js',
        // 资源文件命名
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  
  // 资源处理
  assetsInclude: ['**/*.hdr']
});
