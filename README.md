> [!tip]
> 本项目fork自 Github@Pimeng/classtable ，依据上游开源协议GPL-3.0进行分发，由 @MYS-KISO 做部分修改；同时作为滢尝试边学边改的产物，或可能会出现影响使用的bug，不建议直接用于公众环境。

> 【沁清滢综运//ExuQy_OS】愿每个人都可以被这个世界温柔以待。

# ClassTable Plugin

Miao-Yunzai 机器人课程表插件，支持 WakeUp 课程表导入。

## 如何安装？

方法1. Git安装

```bash
git clone --depth=1 https://github.com/Pimeng/classtable.git ./plugin/classtable
```

> 或者使用镜像
> ```bash
> git clone --depth=1 https://ghproxy.net/https://github.com/Pimeng/classtable.git ./plugin/classtable
> ```

克隆完毕后重启 Yunzai 就可以使用了

> 对的没有依赖，放到插件目录就能用（

方法2. 压缩包安装

直接下载压缩包然后解压到插件目录 `./plugins/classtable`（注意重命名为 `classtable`）
在右上方有个绿色的 `Code` 按钮，点击，然后选择 `Download ZIP`

## 功能特性

- 支持查看今日课表
- 支持群聊和私聊使用
- 支持导出课表

## 支持的应用

- Wakeup 课程表（支持分享口令，文件导出）

> [!CAUTION]
> 因 Wakeup 课程表的API更新，旧API无法正常导入课程表，新API接口因复杂难请求，且获取麻烦，不会考虑重新开放公共服务，暂定使用反代接口，如有需要请联系插件作者获取，https://github.com/Pimeng （免费，仅供学习使用，禁止商业用途）

- 拾光课程表：https://github.com/XingHeYuZhuan/shiguangschedule

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

### 指令列表

- 请使用 #clshelp 查看（才不是某只屑滢懒得再写一遍（哼