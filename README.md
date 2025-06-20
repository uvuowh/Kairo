# Kairo

Kairo 是一款为头脑风暴、思维导图和想法组织而设计的高性能、极简主义的视觉画布应用。它基于 Tauri 框架构建，结合了 React/TypeScript 前端和强大的 Rust 后端，以确保流畅、灵敏和接近原生的使用体验。

![Kairo Screenshot](placeholder.png)
*(这里是未来应用截图的占位符)*

---

## 关于项目

Kairo 旨在为视觉化思考提供一个流畅且直观的空间。与基于 Web 的工具不同，它通过 Rust 利用本地系统资源来处理所有重度计算，例如状态管理、碰撞检测和级联移动。这种架构选择确保了即使在画布上有大量项目时也能保持高性能。

该应用程序拥有一个简洁的无限画布，您可以在其中创建、连接和组织基于文本的节点。它的设计宗旨是快速、可靠且无干扰。

## 核心功能

- **高性能 Rust 内核**: 核心逻辑（如碰撞检测、状态管理）完全由 Rust 驱动，确保在海量节点下依旧提供极致流畅的交互体验。
- **强大的交互设计**: 支持多种选择方式（单击、`Ctrl`+单击、框选）和群组操作（批量移动、连接），并能智能区分鼠标与触控板，提供设备专属的平移/缩放体验。
- **无限画布与持久化**: 在无限延伸的画布上自由创作，并可随时将工作保存至本地 `.kairo` 文件，或从文件中加载。
- **原生应用体验**: 保证程序坞只有一个应用实例，并提供一键将所有节点聚焦于视图中央的便捷功能。

## 技术栈

- [Tauri](https://tauri.app/) - 用于构建轻量级、跨平台桌面应用的框架。
- [React](https://reactjs.org/) - 用于构建用户界面的 JavaScript 库。
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的类型化超集。
- [Rust](https://www.rust-lang.org/) - 用于高性能后端的语言。
- [Vite](https://vitejs.dev/) - 新一代前端构建工具。

## 开始使用

要获取本地副本并运行，请按照以下简单步骤操作。

### 环境要求

- **Rust**: 按照 [rustup.rs](https://rustup.rs/) 的说明进行安装。
- **Node.js 和 pnpm**: 我们建议使用 `pnpm` 作为包管理器。您可以通过 `npm install -g pnpm` 安装它。
- **系统依赖**: 按照 Tauri 官方文档为您使用的操作系统安装必要的依赖项：[Tauri 环境准备](https://tauri.app/develop/guides/prerequisites/)。

### 安装与运行

1. **克隆仓库**
   ```sh
   git clone https://github.com/your-username/kairo.git
   cd kairo
   ```
2. **安装 pnpm 包**
   ```sh
   pnpm install
   ```
3. **在开发模式下运行应用**
   ```sh
   pnpm dev
   ```

## 许可证

根据 MIT 许可证分发。更多信息请参见 `LICENSE` 文件。