# ClassTable Plugin

Miao-Yunzai 机器人课程表插件，支持 WakeUp 课程表导入。

## 如何安装？

1. Git安装

```bash
git clone --depth=1 https://github.com/Pimeng/classtable.git ./plugin/classtable
```

> 或者使用镜像
> ```bash
> git clone --depth=1 https://ghproxy.net/https://github.com/Pimeng/classtable.git ./plugin/classtable
> ```

克隆完毕后重启 Yunzai 就可以使用了

2. 压缩包安装

直接下载压缩包然后解压到插件目录 `./plugins/classtable`（注意重命名为 `classtable`）
在右上方有个绿色的 `Code` 按钮，点击，然后选择 `Download ZIP`

## 功能特性

- 支持查看今日课表
- 支持群聊和私聊使用
- 支持导出课表

## 支持的APP

- Wakeup 课程表（支持分享口令，文件导出）
- 拾光课程表（仅支持文件导入导出）

## 使用方法

### 导入课表

#### Wakeup

1. 打开 WakeUp 课程表 APP
2. 点击右上角分享按钮
3. 复制完整的分享口令消息
4. 将分享口令消息发送给机器人（群聊或私聊）
5. 机器人会自动识别并导入课表

#### 拾光课程表

文件导出之后发给Bot即可（
