# Little Big City - 代码结构说明

## 📁 项目结构

```
src/
├── core/                 # 核心应用逻辑
│   ├── ThreeApp.ts      # Three.js应用封装类
│   └── config.ts        # 应用配置和URL参数管理
│
├── geometry/            # 几何处理模块
│   ├── extrude-adapter.ts    # 多边形/多线段挤压适配器
│   ├── geometry-helpers.ts   # Three.js几何体辅助工具
│   └── processors.ts         # 几何数据处理函数
│
├── utils/               # 工具函数
│   ├── distortion.ts    # 球面投影变形算法
│   └── tessellate.ts    # 几何体细分算法
│
├── map/                 # 地图相关功能
│   ├── tile-loader.ts   # MVT瓦片加载器
│   └── vector-elements.ts    # 矢量元素配置
│
├── ui/                  # UI控制模块
│   └── controls.ts      # dat.GUI控制面板
│
├── exporters/           # 导出功能
│   └── toOBJ.ts        # OBJ模型导出器
│
├── types/               # TypeScript类型定义
│   └── global.d.ts     # 全局类型声明
│
├── styles/              # 样式文件
│   └── main.css        # 主样式表
│
└── main.ts             # 应用入口文件
```

## 📦 模块说明

### Core 核心模块

#### `ThreeApp.ts`
Three.js应用核心封装，提供统一的API接口：
- **ThreeApp类**: 场景、渲染器、相机管理
- **createThreeApp函数**: 兼容原有claygl API的工厂函数
- 主要功能:
  - 场景和渲染器初始化
  - 相机创建（透视/正交）
  - 轨道控制器
  - 材质和灯光创建
  - 纹理加载
  - 渲染循环管理

#### `config.ts`
应用配置管理：
- **Config接口**: 定义所有配置项
- **DEFAULT_CONFIG**: 默认配置值
- **parseUrlParams()**: 解析URL参数
- **loadConfigFromUrl()**: 从URL加载配置
- **makeUrl()**: 生成包含配置的URL

### Geometry 几何模块

#### `extrude-adapter.ts`
多边形和线段的3D挤压：
- **extrudePolygon()**: 挤压多边形为3D体
- **extrudeGeoJSON()**: 挤压GeoJSON要素
- 支持不同的挤压深度（建筑高度）
- 自动处理Polygon和MultiPolygon

#### `geometry-helpers.ts`
Three.js几何体辅助函数：
- 平面几何体创建
- 几何体顶点更新
- 子节点管理（添加/删除）
- 材质创建辅助

#### `processors.ts`
几何数据处理工具：
- **iterateFeatureCoordinates()**: 遍历GeoJSON坐标
- **subdivideLongEdges()**: 边缘细分
- **scaleFeature()**: 坐标缩放和平移
- **unionComplexPolygons()**: 多边形合并
- **cullBuildingPolygons()**: 多边形裁剪
- **unionRect()**: 矩形合并

### Utils 工具模块

#### `distortion.ts`
球面投影变形算法：
- 将平面几何投影到球面
- 支持立方体6个面
- 用于创建星球模式的曲面效果
- **distortion()**: 主变形函数

#### `tessellate.ts`
几何体自适应细分：
- 将大三角形细分为小三角形
- 提高曲面变形的精度
- ✅ 已迁移到Three.js Vector3 API

### Map 地图模块

#### `tile-loader.ts`
Mapbox Vector Tiles (MVT) 加载：
- **loadTile()**: 异步加载MVT瓦片
- **mvtCache**: LRU缓存（最多50个瓦片）
- **filterFeaturesByGeometryType()**: 按几何类型过滤
- 支持buildings、roads、water三种要素

#### `vector-elements.ts`
矢量元素配置：
- **vectorElements**: 建筑、道路、水体配置
- **cubefaces**: 立方体6个面的名称
- 定义各元素的挤压深度和几何类型

### UI 控制模块

#### `controls.ts`
用户界面控制：
- **createUIController()**: 创建dat.GUI控制面板
- **setupLocationControls()**: 设置位置输入框
- 包含以下控制项：
  - 主控制：半径、旋转速度、天空
  - 地面：显示/隐藏、深度、颜色
  - 建筑：显示/隐藏、颜色
  - 道路：显示/隐藏、颜色
  - 水体：显示/隐藏、颜色
  - 云朵：显示/隐藏、颜色、随机生成
  - 导出OBJ模型

### Exporters 导出模块

#### `toOBJ.ts`
OBJ模型导出器：
- 将Three.js场景导出为OBJ格式
- 同时生成MTL材质文件
- 保留几何和材质信息
- 支持打包为ZIP文件

## 🔄 数据流

```
用户输入/URL参数
    ↓
配置管理 (config.ts)
    ↓
地图初始化 (Maptalks)
    ↓
瓦片加载 (tile-loader.ts)
    ↓
MVT解析 → GeoJSON
    ↓
几何处理 (processors.ts)
    ↓
3D挤压 (extrude-adapter.ts)
    ↓
球面变形 (distortion.ts) [星球模式]
    ↓
Three.js渲染 (ThreeApp.ts)
    ↓
用户界面 (controls.ts)
```

## 🎨 主要功能模块

### 1. 场景初始化
- 创建Three.js场景、渲染器、相机
- 设置灯光（方向光+环境光）
- 创建材质和纹理
- 初始化轨道控制器

### 2. 地图数据加载
- 从Nextzen API加载MVT瓦片
- 解析建筑、道路、水体数据
- 缓存瓦片数据

### 3. 几何体生成
- 将GeoJSON挤压为3D几何体
- 根据建筑高度属性设置挤压深度
- 细分长边以适配曲面

### 4. 渲染模式
- **星球模式**: 将几何体投影到球面
- **平铺模式**: 保持平面几何

### 5. 动画效果
- 建筑物生长动画（弹性缓动）
- 自动旋转相机
- 实时渲染更新

### 6. 交互控制
- 鼠标拖拽旋转视角
- 滚轮缩放
- GUI控制面板
- 地图位置输入

## 🔧 技术栈

- **Three.js**: 3D渲染引擎
- **Maptalks**: 地图库
- **Mapbox Vector Tiles**: 矢量瓦片格式
- **poly-extrude**: 多边形挤压库
- **PolyBool**: 多边形布尔运算
- **QuickHull**: 凸包算法（云朵生成）
- **dat.GUI**: 调试控制面板
- **TypeScript**: 类型安全

## 📝 代码注释规范

所有模块都包含详细的注释：
- **模块级注释**: 说明模块功能和用途
- **函数注释**: JSDoc风格，包含参数和返回值说明
- **代码块注释**: 关键逻辑的中文注释
- **接口注释**: 所有接口属性都有说明

## 🚀 开发建议

### 添加新功能
1. 确定功能所属模块（core/geometry/utils/map/ui/exporters）
2. 在对应文件夹创建新文件
3. 导出函数/类供main.ts使用
4. 添加详细的注释和类型定义

### 修改现有功能
1. 找到对应的模块文件
2. 阅读现有注释理解逻辑
3. 修改并更新注释
4. 测试修改是否影响其他模块

### 代码风格
- 使用TypeScript严格模式
- 所有函数都应有类型注解
- 优先使用接口定义数据结构
- 保持函数职责单一
- 避免过长的函数（建议<100行）

## ⚠️ 待办事项

1. ~~**tessellate.ts**: 迁移到Three.js Vector3 API（当前使用claygl）~~ ✅ 已完成
2. **类型定义**: 完善global.d.ts中的第三方库类型
3. **错误处理**: 增强瓦片加载失败的处理
4. **性能优化**: 大量建筑时的渲染优化
5. **单元测试**: 添加核心函数的单元测试
6. **移除claygl**: 如果没有其他使用，可以移除claygl依赖

## 📚 相关文档

- [Three.js文档](https://threejs.org/docs/)
- [Mapbox Vector Tile规范](https://github.com/mapbox/vector-tile-spec)
- [TypeScript手册](https://www.typescriptlang.org/docs/)
