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

- Wakeup 课程表（不再支持）

>  [!CAUTION] **请尽快停用 WakeUp 课程表！**
>
> WakeUp 近期进行了两次逆天操作，直接导致本插件无法再通过口令导入课表：
> 1. **4月初**：迁移课表请求接口并加入鉴权，开发者尝试通过反代服务临时解决；
> 2. **4月29日**：进一步加强鉴权，请求直接被拦截并返回 **“命中反作弊”**。
>
> 这种刻意阻断第三方访问、甚至用“反作弊”嘲讽开发者的行为，不仅造成了数据垄断，也背离了课表工具应有的开放初心。同时，WakeUp 本身的广告越来越多，逐渐沦为一个令人厌烦的广告展示器。  
> **为了你的使用体验和数据自主权，建议尽快迁移至其他课表软件，如 [拾光课程表](https://github.com/XingHeYuZhuan/shiguangschedule) 或 星链课表。**
>
> 本插件已紧急适配 JSON 导入（支持拾光导出格式）导入，请放心使用。

- 拾光课程表：https://github.com/XingHeYuZhuan/shiguangschedule

## 使用方法

### 导入课表

#### 拾光课程表

文件导出之后发给Bot即可（

### 指令列表

- 请使用 #clshelp 查看（才不是某只屑滢懒得再写一遍（哼