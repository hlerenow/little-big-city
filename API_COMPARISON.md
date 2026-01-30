# claygl vs Three.js Vector3 API 对比

## 📚 快速参考

### 创建和初始化

| 操作 | claygl | Three.js |
|------|--------|----------|
| 创建向量 | `new Vector3()` | `new THREE.Vector3()` |
| 创建并初始化 | `new Vector3(1, 2, 3)` | `new THREE.Vector3(1, 2, 3)` |
| 设置值 | `Vector3.set(v, x, y, z)` | `v.set(x, y, z)` |
| 复制向量 | `Vector3.copy(out, v)` | `out.copy(v)` |
| 克隆向量 | `v.clone()` | `v.clone()` |

### 坐标访问

| 操作 | claygl | Three.js |
|------|--------|----------|
| 访问X | `v.array[0]` 或 `v.x` | `v.x` |
| 访问Y | `v.array[1]` 或 `v.y` | `v.y` |
| 访问Z | `v.array[2]` 或 `v.z` | `v.z` |
| 设置X | `v.array[0] = 1` 或 `v.x = 1` | `v.x = 1` |

### 基本运算

| 操作 | claygl | Three.js |
|------|--------|----------|
| 向量相加 | `Vector3.add(out, a, b)` | `out.addVectors(a, b)` |
| 向量相减 | `Vector3.sub(out, a, b)` | `out.subVectors(a, b)` |
| 向量乘法 | `Vector3.mul(out, a, b)` | `out.multiplyVectors(a, b)` |
| 向量除法 | `Vector3.div(out, a, b)` | `out.divideVectors(a, b)` |
| 自加 | `Vector3.add(v, v, delta)` | `v.add(delta)` |
| 自减 | `Vector3.sub(v, v, delta)` | `v.sub(delta)` |

### 标量运算

| 操作 | claygl | Three.js |
|------|--------|----------|
| 标量乘法 | `Vector3.scale(out, v, s)` | `out.copy(v).multiplyScalar(s)` |
| 标量除法 | `Vector3.scale(out, v, 1/s)` | `out.copy(v).divideScalar(s)` |
| 缩放并相加 | `Vector3.scaleAndAdd(out, a, b, s)` | `out.copy(a).addScaledVector(b, s)` |
| 自身缩放 | `Vector3.scale(v, v, s)` | `v.multiplyScalar(s)` |

### 向量属性

| 操作 | claygl | Three.js |
|------|--------|----------|
| 长度 | `Vector3.len(v)` | `v.length()` |
| 长度平方 | `Vector3.lenSquared(v)` | `v.lengthSq()` |
| 距离 | `Vector3.dist(a, b)` | `a.distanceTo(b)` |
| 距离平方 | `Vector3.distSquared(a, b)` | `a.distanceToSquared(b)` |
| 点积 | `Vector3.dot(a, b)` | `a.dot(b)` |
| 叉积 | `Vector3.cross(out, a, b)` | `out.crossVectors(a, b)` |

### 归一化和方向

| 操作 | claygl | Three.js |
|------|--------|----------|
| 归一化 | `Vector3.normalize(out, v)` | `out.copy(v).normalize()` |
| 自身归一化 | `Vector3.normalize(v, v)` | `v.normalize()` |
| 求反 | `Vector3.negate(out, v)` | `out.copy(v).negate()` |
| 线性插值 | `Vector3.lerp(out, a, b, t)` | `out.lerpVectors(a, b, t)` |

## 💡 常见模式转换

### 1. 向量相减并计算长度

```typescript
// claygl
Vector3.sub(edge, p1, p2);
const length = Vector3.len(edge);

// Three.js
edge.subVectors(p1, p2);
const length = edge.length();
```

### 2. 归一化向量

```typescript
// claygl
Vector3.normalize(dir, dir);

// Three.js
dir.normalize();
```

### 3. 缩放并相加（a + b * s）

```typescript
// claygl
const result = Vector3.scaleAndAdd(new Vector3(), a, b, scale);

// Three.js
const result = new THREE.Vector3().copy(a).addScaledVector(b, scale);
```

### 4. 向量插值

```typescript
// claygl
Vector3.lerp(result, start, end, 0.5);

// Three.js
result.lerpVectors(start, end, 0.5);
```

### 5. 沿方向移动

```typescript
// claygl
Vector3.scaleAndAdd(newPos, position, direction, distance);

// Three.js
newPos.copy(position).addScaledVector(direction, distance);
```

## 🔄 完整示例对比

### 示例1: 计算三角形法向量

```typescript
// ============ claygl ============
const edge1 = new Vector3();
const edge2 = new Vector3();
const normal = new Vector3();

Vector3.sub(edge1, p2, p1);
Vector3.sub(edge2, p3, p1);
Vector3.cross(normal, edge1, edge2);
Vector3.normalize(normal, normal);

// ============ Three.js ============
const edge1 = new THREE.Vector3();
const edge2 = new THREE.Vector3();
const normal = new THREE.Vector3();

edge1.subVectors(p2, p1);
edge2.subVectors(p3, p1);
normal.crossVectors(edge1, edge2);
normal.normalize();
```

### 示例2: 沿路径插值

```typescript
// ============ claygl ============
const points = [];
const step = 1.0 / segments;
for (let i = 0; i <= segments; i++) {
    const t = i * step;
    const point = new Vector3();
    Vector3.lerp(point, start, end, t);
    points.push(point);
}

// ============ Three.js ============
const points = [];
const step = 1.0 / segments;
for (let i = 0; i <= segments; i++) {
    const t = i * step;
    const point = new THREE.Vector3().lerpVectors(start, end, t);
    points.push(point);
}
```

### 示例3: 计算反射向量

```typescript
// ============ claygl ============
const dot = Vector3.dot(incident, normal);
const reflected = new Vector3();
Vector3.scale(reflected, normal, 2 * dot);
Vector3.sub(reflected, incident, reflected);

// ============ Three.js ============
const reflected = new THREE.Vector3();
reflected.copy(incident).reflect(normal);
```

## 🎯 关键差异

### 1. 方法调用方式

**claygl**: 主要使用静态方法，需要传入输出参数
```typescript
Vector3.sub(result, a, b);  // 结果存入result
```

**Three.js**: 使用实例方法，支持链式调用
```typescript
result.subVectors(a, b);    // 结果存入result
// 或链式调用
result.copy(a).sub(b);      // 也可以
```

### 2. 坐标访问

**claygl**: 通过`array`属性或直接访问
```typescript
v.array[0]  // 或 v.x
v.array[1]  // 或 v.y
v.array[2]  // 或 v.z
```

**Three.js**: 直接访问属性
```typescript
v.x
v.y
v.z
```

### 3. 内存管理

**claygl**: 通常需要预先创建输出向量
```typescript
const result = new Vector3();
Vector3.add(result, a, b);
```

**Three.js**: 可以链式调用，自动处理
```typescript
const result = new THREE.Vector3().addVectors(a, b);
// 或重用对象
result.addVectors(a, b);
```

## 📈 性能考虑

### 对象重用 (推荐)

```typescript
// ❌ 频繁创建对象（低效）
for (let i = 0; i < 1000; i++) {
    const temp = new THREE.Vector3();
    temp.copy(a).add(b);
}

// ✅ 重用对象（高效）
const temp = new THREE.Vector3();
for (let i = 0; i < 1000; i++) {
    temp.copy(a).add(b);
}
```

### 链式调用

```typescript
// ❌ 多次调用（可读性差）
result.copy(a);
result.add(b);
result.multiplyScalar(0.5);
result.normalize();

// ✅ 链式调用（可读性好）
result.copy(a)
    .add(b)
    .multiplyScalar(0.5)
    .normalize();
```

## 🔧 迁移检查清单

- [ ] 替换 `import { Vector3 } from 'claygl'` 为 `import * as THREE from 'three'`
- [ ] 替换 `new Vector3()` 为 `new THREE.Vector3()`
- [ ] 替换静态方法为实例方法
  - [ ] `Vector3.set()` → `.set()`
  - [ ] `Vector3.sub()` → `.subVectors()`
  - [ ] `Vector3.len()` → `.length()`
  - [ ] `Vector3.scale()` → `.multiplyScalar()`
  - [ ] `Vector3.scaleAndAdd()` → `.addScaledVector()`
- [ ] 替换坐标访问
  - [ ] `v.array[0]` → `v.x`
  - [ ] `v.array[1]` → `v.y`
  - [ ] `v.array[2]` → `v.z`
- [ ] 测试功能
- [ ] 性能基准测试

## 📚 参考资料

- [Three.js Vector3 文档](https://threejs.org/docs/#api/en/math/Vector3)
- [Three.js 数学工具](https://threejs.org/docs/#api/en/math/MathUtils)
- [Three.js 示例](https://threejs.org/examples/)

---

**提示**: Three.js的Vector3 API更现代、更直观，支持链式调用，代码可读性更好！
