> [!tip]
> 本插件仍在测试，如果你不是受 @Pimeng 邀请来测试这个插件的，请不要安装这个插件！！有可能被植入恶意代码！！
> 
> 本项目fork自 Github@Pimeng/classtable ，依据上游开源协议GPL-3.0进行分发，由 @MYS-KISO 做部分修改；同时作为滢尝试边学边改的产物，或可能会出现影响使用的bug，不建议直接用于公众环境。

> 【沁清滢综运//ExuQy_OS】愿每个人都可以被这个世界温柔以待。

# ClassTable Plugin

Miao-Yunzai 机器人课程表插件，支持 WakeUp 课程表导入。

## 如何安装？

1. Git安装

```bash
git clone --depth=1 https://github.com/Pimeng/classtable.git ./plugin/classtable
```

克隆完毕后重启 Yunzai 就可以使用了

2. 压缩包安装

直接下载压缩包然后解压到插件目录 `./plugins/classtable`（注意重命名为 `classtable`）
在右上方有个绿色的 `Code` 按钮，点击，然后选择 `Download ZIP`

## 功能特性

- 通过 WakeUp 课程表 APP 的分享口令导入课表
- 支持查看今日课表
- 支持群聊和私聊使用
- 自动撤回分享口令保护隐私

## 使用方法

### 导入课表

1. 打开 WakeUp 课程表 APP
2. 点击右上角分享按钮
3. 复制完整的分享口令消息
4. 将分享口令消息发送给机器人（群聊或私聊）
5. 机器人会自动识别并导入课表

### 指令列表

- 请使用 #clshelp 查看（才不是某只屑滢懒得再写一遍（哼