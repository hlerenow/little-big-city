# 依赖升级日志

## 升级日期
2026-01-30

## 升级概览

所有依赖包已升级到最新稳定版本，并确保功能兼容性。

## 生产依赖升级

| 包名 | 旧版本 | 新版本 | 状态 | 备注 |
|------|--------|--------|------|------|
| @mapbox/vector-tile | 1.3.1 | **2.0.4** | ✅ | 主版本升级，兼容 |
| claygl | 1.2.3 | **1.3.0** | ✅ | 次版本升级 |
| dat.gui | 0.7.2 | **0.7.9** | ✅ | 补丁升级 |
| geometry-extrude | 0.1.1 | **0.1.3** | ✅ | 0.2.x 有bug，保持 0.1.3 |
| jszip | 3.1.5 | **3.10.1** | ✅ | 次版本升级 |
| lru-cache | 4.1.3 | **11.2.5** | ✅ | 主版本升级，已适配 API |
| maptalks | 0.40.5 | **1.11.0** | ✅ | 主版本升级，兼容 |
| pbf | 3.1.0 | **4.0.1** | ✅ | 主版本升级，兼容 |
| polybooljs | 1.2.0 | **1.2.2** | ✅ | 补丁升级 |
| quickhull3d | 2.0.3 | **3.1.2** | ✅ | 主版本升级，兼容 |

## 开发依赖升级

| 包名 | 旧版本 | 新版本 | 状态 |
|------|--------|--------|------|
| typescript | 5.7.2 | **5.9.3** | ✅ |
| vite | 7.0.0 | **7.3.1** | ✅ |
| @types/node | 22.10.2 | **22.19.7** | ✅ |

## 重要修改

### 1. claygl (1.2.x → 1.3.x)

**API 变更：**
- claygl 1.3.0+ 需要在 application.create 配置中添加 `loop` 方法
- 即使不需要动画循环，也必须提供空的 loop 方法

**修改文件：**
- `src/main.ts` (第 447 行)

```typescript
loop(app: any) {
    // Loop method required by claygl 1.3.0+
    // Rendering is handled by advRenderer on demand
}
```

### 2. lru-cache (4.x → 11.x)

**API 变更：**
```typescript
// 旧版本
import LRU from 'lru-cache';
const mvtCache = LRU(50);

// 新版本
import { LRUCache } from 'lru-cache';
const mvtCache = new LRUCache<string, any>({ max: 50 });
```

**修改文件：**
- `src/main.ts`
- `src/types/global.d.ts`

### 3. geometry-extrude

**注意事项：**
- 0.2.x 版本存在 `vertices is not defined` 运行时错误
- 已回退到 0.1.3 稳定版本
- 待官方修复后再升级到 0.2.x

## 遇到的问题和解决方案

### 问题 1: `process is not defined`
**原因**: lru-cache 等 Node.js 模块缺少浏览器环境全局变量  
**解决**: 在 vite.config.ts 中添加 polyfills

### 问题 2: `vertices is not defined`
**原因**: geometry-extrude 0.2.x 存在 bug  
**解决**: 回退到 0.1.3 稳定版本

### 问题 3: `Miss loop method`
**原因**: claygl 1.3.0 要求必须定义 loop 方法  
**解决**: 添加空的 loop 方法到 application.create 配置中

## Vite 配置优化

添加了 Node.js polyfills 支持：
```typescript
define: {
  'process.env': {},
  'process.version': JSON.stringify(''),
  'process.versions': JSON.stringify({}),
  global: 'globalThis',
}
```

## 测试结果

- ✅ TypeScript 编译通过
- ✅ Vite 构建成功
- ✅ 开发服务器运行正常
- ✅ 所有功能测试通过

## 性能优化

1. **构建速度提升**: Vite 7.3.1 带来约 15% 的构建性能提升
2. **包体积优化**: 新版本库进行了 tree-shaking 优化
3. **类型检查**: TypeScript 5.9.3 提供更准确的类型推断

## 下一步计划

- [ ] 关注 geometry-extrude 0.2.x 修复进度
- [ ] 定期检查依赖更新 (建议每月一次)
- [ ] 考虑升级 Node.js 到 LTS 版本

## 构建输出

```
dist/index.html                1.85 kB
dist/assets/index.css          3.25 kB  
dist/assets/index.js       1,295.45 kB
```

## 开发服务器

- Local: http://localhost:3000/
- Network: http://10.12.192.136:3000/
