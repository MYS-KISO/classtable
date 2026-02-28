import Config from './components/Config.js'

// 支持锅巴
export function supportGuoba() {
    return {
        // 插件信息，将会显示在前端页面
        // 如果你的插件没有在插件库里，那么需要填上补充信息
        // 如果存在的话，那么填不填就无所谓了，填了就以你的信息为准
        pluginInfo: {
            name: 'classtable',
            title: 'classtable',
            author: '@Pimeng',
            authorLink: 'https://github.com/Pimeng',
            link: 'hhttps://github.com/Pimeng/classtable',
            isV3: true,
            isV2: false,
            description: 'Yunzai课程表插件',
            // 显示图标，此为个性化配置
            // 图标可在 https://icon-sets.iconify.design 这里进行搜索
            icon: 'emojione-v1:bookmark-tabs',
            // 图标颜色，例：#FF0000 或 rgb(255, 0, 0)
            iconColor: '#000'
        },
    }
}