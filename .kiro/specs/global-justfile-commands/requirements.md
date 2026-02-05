# 需求文档

## 简介

本文档定义了 NaughtyAgent 全局 justfile 命令系统的需求。该系统支持全局命令（存放在 `~/.naughtyagent/justfile`）和项目命令（存放在 `./justfile`）的统一管理，提供命令发现、合并和输入提示功能，让用户可以通过 `/` 前缀快速访问所有可用命令。

## 术语表

- **Global_Justfile**: 存放在 `~/.naughtyagent/justfile` 的全局命令文件，包含跨项目通用的命令
- **Project_Justfile**: 存放在项目根目录 `./justfile` 的项目特有命令文件
- **Command_Registry**: 命令注册表，负责发现、解析和合并全局与项目命令
- **Command_Prompt**: 命令提示组件，当用户输入 `/` 时显示可用命令列表
- **Just_Parser**: justfile 解析器，提取命令名称、描述和参数信息
- **Install_Script**: 安装脚本，负责在构建后将默认 justfile 复制到全局目录

## 需求列表

### 需求 1: 全局 Justfile 支持

**用户故事:** 作为用户，我希望有一个全局 justfile 存放通用命令，以便在任意项目目录下都能使用这些命令。

#### 验收标准

1. Command_Registry 必须从 `~/.naughtyagent/justfile` 路径加载全局命令
2. 当全局 justfile 不存在时，Command_Registry 必须返回空的全局命令列表而不报错
3. Command_Registry 必须在应用启动时自动检测并加载全局 justfile
4. 当全局 justfile 文件格式错误时，Command_Registry 必须记录警告日志并继续运行
5. Command_Registry 必须支持全局 justfile 中的所有标准 just 语法（命令、参数、注释）

### 需求 2: 项目 Justfile 支持

**用户故事:** 作为用户，我希望项目 justfile 中的命令只在对应项目目录下可用，以便管理项目特有的命令。

#### 验收标准

1. Command_Registry 必须从当前工作目录的 `./justfile` 路径加载项目命令
2. 当项目 justfile 不存在时，Command_Registry 必须返回空的项目命令列表而不报错
3. Command_Registry 必须在工作目录变更时重新加载项目 justfile
4. 当项目 justfile 文件格式错误时，Command_Registry 必须记录警告日志并继续运行
5. Command_Registry 必须支持项目 justfile 中的所有标准 just 语法

### 需求 3: 命令合并与优先级

**用户故事:** 作为用户，我希望项目命令优先级高于全局命令，以便在项目中覆盖全局命令的行为。

#### 验收标准

1. 当全局和项目 justfile 中存在同名命令时，Command_Registry 必须使用项目命令覆盖全局命令
2. Command_Registry 必须返回合并后的命令列表，包含所有唯一命令
3. Command_Registry 必须在命令列表中标注每个命令的来源（global/project）
4. Command_Registry 必须保持命令的原始顺序（全局命令在前，项目命令在后，同名命令只保留项目版本）
5. 当用户执行命令时，Command_Registry 必须使用正确来源的 justfile 执行

### 需求 4: 命令输入提示

**用户故事:** 作为用户，我希望输入 `/` 后能看到所有可用命令的提示列表，以便快速选择和执行命令。

#### 验收标准

1. 当用户在输入框中输入 `/` 时，Command_Prompt 必须显示可用命令的下拉列表
2. Command_Prompt 必须显示命令名称、描述和来源标识（🌐 全局 / 📁 项目）
3. Command_Prompt 必须支持模糊搜索过滤命令列表
4. 当用户使用方向键导航时，Command_Prompt 必须高亮当前选中的命令
5. 当用户按下 Enter 时，Command_Prompt 必须将选中的命令填入输入框
6. 当用户按下 Escape 或输入框失去焦点时，Command_Prompt 必须关闭提示列表
7. Command_Prompt 必须显示命令的参数信息（如果有）

### 需求 5: Justfile 解析

**用户故事:** 作为开发者，我希望系统能正确解析 justfile 格式，以便提取命令的完整信息。

#### 验收标准

1. Just_Parser 必须解析命令名称（以字母开头，可包含字母、数字、连字符、下划线）
2. Just_Parser 必须解析命令上方的注释作为命令描述
3. Just_Parser 必须解析命令参数（如 `test-file FILE:`）
4. Just_Parser 必须识别并跳过私有命令（以 `_` 开头的命令）
5. Just_Parser 必须正确处理多行命令体
6. Just_Parser 必须识别 `default` 命令作为默认执行命令
7. 当解析失败时，Just_Parser 必须返回详细的错误信息

### 需求 6: 命令执行

**用户故事:** 作为用户，我希望能直接执行 justfile 中的命令，以便快速完成常见任务。

#### 验收标准

1. 当用户输入 `/命令名` 时，Command_Registry 必须执行对应的 just 命令
2. 当命令需要参数时，Command_Registry 必须提示用户输入参数
3. Command_Registry 必须在正确的目录下执行命令（全局命令在当前目录，项目命令在项目根目录）
4. Command_Registry 必须捕获命令的标准输出和错误输出并显示给用户
5. 当命令执行失败时，Command_Registry 必须显示错误信息和退出码
6. Command_Registry 必须支持命令执行的超时控制

### 需求 7: 安装脚本

**用户故事:** 作为开发者，我希望构建后自动安装默认的全局 justfile，以便用户开箱即用。

#### 验收标准

1. Install_Script 必须在 `pnpm build` 后自动执行
2. Install_Script 必须创建 `~/.naughtyagent/` 目录（如果不存在）
3. 当全局 justfile 不存在时，Install_Script 必须复制默认 justfile 到全局目录
4. 当全局 justfile 已存在时，Install_Script 必须跳过复制并显示提示信息
5. Install_Script 必须提供 `--force` 选项强制覆盖现有文件
6. Install_Script 必须在复制成功后显示确认信息

### 需求 8: 默认全局命令

**用户故事:** 作为用户，我希望有一组预定义的全局命令，以便快速执行常见的开发任务。

#### 验收标准

1. 默认全局 justfile 必须包含 `help` 命令显示所有可用命令
2. 默认全局 justfile 必须包含 `version` 命令显示 NaughtyAgent 版本
3. 默认全局 justfile 必须包含 `config` 命令打开配置文件
4. 默认全局 justfile 必须包含 `update` 命令检查并更新 NaughtyAgent
5. 默认全局 justfile 必须包含清晰的注释说明每个命令的用途
6. 默认全局 justfile 必须遵循 justfile 最佳实践格式
