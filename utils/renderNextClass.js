import fs from "node:fs"
import path from "node:path"
import { parseTimeString, isInClassTime, findConsecutiveClasses, getCurrentTimeMinutes, calculateTimeInterval } from './timeUtils.js'
import { groupQueryCache, getGroupCacheKey, getSkipClassCacheKey } from './cacheUtils.js'

const DATA_DIR = path.join("./plugins", "classtable", "data")
const USER_DATA_DIR = path.join(DATA_DIR, "users")
const GROUP_DATA_DIR = path.join(DATA_DIR, "groups")

/**
 * 获取群组中多个用户的下一节课信息用于HTML渲染
 * @param {Object} e - 消息事件对象
 * @param {number} limit - 限制显示的用户数量，可选
 * @returns {Object} 包含渲染所需所有数据的对象
 */
export async function getMultipleNextClassRenderData(e, limit = null) {
  try {
    const groupId = e.group_id
    const userIds = getAllUsersWithSchedule(groupId)
    
    // 如果没有用户有课表数据
    if (!userIds || userIds.length === 0) {
      logger.info(`[ClassTable] 群组${groupId}中没有找到有课表数据的用户`)
      const result = {
        list: [{
          userName: "暂无数据",
          hasClass: false,
          NoCourseTitle: "暂无课表数据",
          NoCourseTip: "群成员尚未导入课表"
        }]
      }
      logger.debug(`[ClassTable] 返回渲染数据: ${JSON.stringify(result, null, 2)}`)
      return result
    }
    
    const currentTime = new Date()
    const currentDay = currentTime.getDay() === 0 ? 7 : currentTime.getDay()
    const currentHour = currentTime.getHours()
    const currentMinute = currentTime.getMinutes()
    let userList = []
    
    logger.info(`[ClassTable] 开始处理${userIds.length}个用户的课表数据`)
    
    const cacheKey = getGroupCacheKey(groupId, limit)
    let cachedList = groupQueryCache.get(cacheKey)
    if (cachedList) {
      logger.debug(`[ClassTable] 使用缓存的渲染数据`)
      return { list: cachedList }
    }
    
    // 使用Promise.all并行处理用户数据
    const userPromises = userIds.map(async (userId) => {
      let userName = "未知用户"
      let avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=100`
      try {
        const memberInfo = e.bot.gml.get(e.group_id)
        const member = memberInfo.get(Number(userId))
        userName = member?.card || member?.nickname || `用户${userId}`
        if (member && member.avatar) {
          avatarUrl = member.avatar
        }
      } catch (err) {
        userName = `用户${userId}`
      }
      
      const filePath = getSchedulePath(userId)
      if (!fs.existsSync(filePath)) {
        return {
          userName: userName,
          avatar: avatarUrl,
          hasClass: false,
          NoCourseTitle: "未导入课表",
          NoCourseTip: "该用户尚未导入课表"
        }
      }
      
      try {
        const scheduleData = loadScheduleFromFile(filePath)
        const schedule = scheduleData.schedule || scheduleData // 兼容新旧数据格式
        
        // 获取该用户的开学日期，如果没有则使用默认值
        const userStartDate = scheduleData.startDate || "2025-09-01"
        const currentWeek = calculateCurrentWeek(new Date(userStartDate), currentTime)
        
        const nextClassInfo = findNextClass(schedule, currentWeek, currentDay, currentHour, currentMinute)

        if (!nextClassInfo || nextClassInfo.status === 'noneToday') {
          return {
            userName: (userName || "").length > 16 ? (userName.substring(0, 16) + "...") : userName,
            avatar: avatarUrl,
            hasClass: false,
            type: "空闲",
            typeColor: "#50ff05ff",
            NoCourseTitle: "今日无课",
            NoCourseTip: "好好休息一下吧"
          }
        } else {
          let nowType = "将开始"
          let typeColor = "#ffb700ff"
          if (nextClassInfo.status === 'ongoing') {
            nowType = "上课中"
            typeColor = "#00eeffff"
          }

          // 检查用户是否翘课
          const skipKey = getSkipClassCacheKey(userId)
          let isSkippingClass = false
          try {
            isSkippingClass = !!(await redis.get(skipKey))
          } catch (error) {
            logger.error(`[ClassTable] 检查翘课状态失败: ${error}`)
          }

          // 如果用户翘课且课程状态为'ongoing'或'next'，则显示翘课状态
          if (isSkippingClass && (nextClassInfo.status === 'ongoing' || nextClassInfo.status === 'next')) {
            nowType = "翘课中"
            typeColor = "#ff4757ff"
          }

          // 计算距离课程结束的时间（分钟）
          let timeUntilEnd = null
          if (nextClassInfo.status === 'ongoing') {
            const currentTimeStr = `${currentHour}:${currentMinute}`
            timeUntilEnd = calculateTimeInterval(currentTimeStr, nextClassInfo.endTime)
          }

          return {
            userName: (userName || "").length > 14 ? (userName.substring(0, 14) + "...") : userName,
            avatar: avatarUrl,
            hasClass: true,
            className: (nextClassInfo.courseName || "").length > 10 ? (nextClassInfo.courseName.substring(0, 10) + "...") : nextClassInfo.courseName,
            type: nowType,
            typeColor: typeColor,
            startTime: nextClassInfo.startTime,
            endTime: nextClassInfo.endTime,
            timeUntilEnd: timeUntilEnd
          }
        }
      } catch (error) {
        logger.error(`[ClassTable] 获取用户${userId}的课表数据失败: ${error}`)
        return {
          userName: userName,
          hasClass: false,
          NoCourseTitle: "数据错误",
          NoCourseTip: "获取课表信息时发生错误"
        }
      }
    })
    
    // 等待所有用户处理完成
    const userResults = await Promise.all(userPromises)
    userList.push(...userResults.filter(item => item !== undefined))
    
    // 对用户列表进行排序：先按状态排序，再按上课时间排序
    userList.sort((a, b) => {
      // 定义状态优先级
      const statusPriority = {
        '上课中': 1,
        '翘课中': 2,
        '将开始': 3,
        '空闲': 4
      }
      
      // 获取两个用户的状态
      const statusA = a.hasClass ? a.type : '空闲'
      const statusB = b.hasClass ? b.type : '空闲'
      
      // 按照优先级排序
      const priorityA = statusPriority[statusA] || 999
      const priorityB = statusPriority[statusB] || 999
      
      // 如果状态不同，按状态排序
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      
      // 如果状态相同，按上课时间排序
      // 只有有课的用户才有时间信息
      if (a.hasClass && b.hasClass && a.startTime && b.startTime) {
        // 将时间字符串转换为分钟数进行比较
        const totalMinutesA = getCurrentTimeMinutes(a.startTime)
        const totalMinutesB = getCurrentTimeMinutes(b.startTime)
        
        return totalMinutesA - totalMinutesB
      }
      
      // 如果状态相同但无法按时间排序，保持原顺序
      return 0
    })
    
    // 缓存结果5分钟
    groupQueryCache.set(cacheKey, userList, 5 * 60 * 1000)
    
    // 如果指定了限制数量，只返回前N个用户
    if (limit && limit > 0 && userList.length > limit) {
      userList = userList.slice(0, limit)
    }
    
    const result = {
      list: userList
    }
    logger.debug(`[ClassTable] 返回渲染数据: ${JSON.stringify(result, null, 2)}`)
    return result
  } catch (error) {
    logger.error(`[ClassTable] 获取多人下一节课渲染数据失败: ${error}`)
    return {
      list: [{
        userName: "系统错误",
        hasClass: false,
        NoCourseTitle: "系统错误",
        NoCourseTip: "获取课表信息时发生错误"
      }]
    }
  }
}

/**
 * 获取所有有课表数据的用户ID
 * @returns {Array} 用户ID数组
 */
function getAllUsersWithScheduleFromFiles() {
  try {
    // 直接从用户数据目录中读取所有用户文件
    const userIds = []
    
    // 确保用户数据目录存在
    if (!fs.existsSync(USER_DATA_DIR)) {
      logger.info(`[ClassTable] 用户数据目录不存在: ${USER_DATA_DIR}`)
      return []
    }
    
    // 读取目录中的所有文件
    const files = fs.readdirSync(USER_DATA_DIR)
    
    // 过滤出.json文件并提取用户ID
    for (const file of files) {
      if (file.endsWith('.json')) {
        const userId = file.replace('.json', '')
        userIds.push(userId)
      }
    }
    
    logger.info(`[ClassTable] 从文件中找到${userIds.length}个有课表数据的用户`)
    return userIds
  } catch (error) {
    logger.error(`[ClassTable] 获取所有用户列表失败: ${error}`)
    return []
  }
}

/**
 * 获取群组中所有有课表数据的用户ID
 * @param {string} groupId - 群组ID
 * @returns {Array} 用户ID数组
 */
function getAllUsersWithSchedule(groupId) {
  try {
    // 从群组用户列表文件中读取用户ID
    const groupUserListPath = path.join(GROUP_DATA_DIR, `${groupId}_userlist.json`)
    
    if (!fs.existsSync(groupUserListPath)) {
      logger.info(`[ClassTable] 群组${groupId}的用户列表文件不存在`)
      return []
    }
    
    const content = fs.readFileSync(groupUserListPath, 'utf8')
    const userIds = JSON.parse(content)
    
    // 过滤出实际存在课表文件的用户
    const validUserIds = []
    for (const userId of userIds) {
      const userFilePath = path.join(USER_DATA_DIR, `${userId}.json`)
      if (fs.existsSync(userFilePath)) {
        validUserIds.push(userId)
      }
    }
    
    return validUserIds
  } catch (error) {
    logger.error(`[ClassTable] 获取群组用户列表失败: ${error}`)
    return []
  }
}

/**
 * 获取课表文件路径
 * @param {string} userId - 用户ID
 * @returns {string} 文件路径 
 */
function getSchedulePath(userId) {
  return path.join(USER_DATA_DIR, `${userId}.json`)
}

/**
 * 从文件加载课表数据
 * @param {string} filePath - 文件路径
 * @returns {Object} 课表数据
 */
function loadScheduleFromFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

/**
 * 计算当前周次
 * @param {Date} startDate - 开学日期
 * @param {Date} currentDate - 当前日期
 * @returns {number} 当前周次
 */
function calculateCurrentWeek(startDate, currentDate) {
  const deltaDays = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24))
  return Math.floor(deltaDays / 7) + 1
}

/**
 * 查找下一节课
 * @param {Object} schedule - 课表数据
 * @param {number} currentWeek - 当前周次
 * @param {number} currentDay - 当前星期几(1-7)
 * @param {number} currentHour - 当前小时
 * @param {number} currentMinute - 当前分钟
 * @returns {Object|null} 下一节课信息或null
 */
function findNextClass(schedule, currentWeek, currentDay, currentHour, currentMinute) {
  // 若不存在当周数据或当日数据，直接判定今天没有课程
  if (!schedule[currentWeek] || !schedule[currentWeek][currentDay]) {
    return { status: 'noneToday' }
  }

  const todayClasses = []
  for (const [node, classes] of Object.entries(schedule[currentWeek][currentDay])) {
    for (const cls of classes) {
      todayClasses.push({
        ...cls,
        node: parseInt(node)
      })
    }
  }

  // 如果今天根本没有课程
  if (todayClasses.length === 0) {
    return { status: 'noneToday' }
  }

  todayClasses.sort((a, b) => a.node - b.node)

  // 优先查找当前正在上的课程
  for (let i = 0; i < todayClasses.length; i++) {
    const cls = todayClasses[i]
    if (isInClassTime(cls.startTime, cls.endTime, currentHour, currentMinute)) {
      // 找到了当前正在上的课程，检查是否有连续的相同课程
      const consecutiveResult = findConsecutiveClasses(todayClasses, i)
      return {
        ...consecutiveResult.finalClass,
        startTime: consecutiveResult.startTime,
        endTime: consecutiveResult.finalEndTime,
        week: currentWeek,
        status: 'ongoing'
      }
    }
  }

  // 没有正在上的课程，找下一节（仅限今天）
  for (let i = 0; i < todayClasses.length; i++) {
    const cls = todayClasses[i]
    const { hour: startHour, minute: startMinute } = parseTimeString(cls.startTime)
    if (startHour > currentHour || (startHour === currentHour && startMinute > currentMinute)) {
      // 找到了下一节课，检查是否有连续的相同课程
      const consecutiveResult = findConsecutiveClasses(todayClasses, i)
      return {
        ...consecutiveResult.finalClass,
        startTime: consecutiveResult.startTime,
        endTime: consecutiveResult.finalEndTime,
        week: currentWeek,
        status: 'next'
      }
    }
  }

  // 今天有课程但已经结束
  return { status: 'noneToday' }
}

/**
 * 获取所有用户的下一节课信息用于HTML渲染
 * @param {Object} e - 消息事件对象
 * @param {number} limit - 限制显示的用户数量，可选
 * @returns {Object} 包含渲染所需所有数据的对象
 */
export async function getAllUsersNextClassRenderData(e, limit = null) {
  try {
    // 获取所有有课表数据的用户ID
    const userIds = getAllUsersWithScheduleFromFiles()
    
    // 如果没有用户有课表数据
    if (!userIds || userIds.length === 0) {
      logger.info(`[ClassTable] 没有找到有课表数据的用户`)
      const result = {
        list: [{
          userName: "暂无数据",
          hasClass: false,
          NoCourseTitle: "暂无课表数据",
          NoCourseTip: "系统中没有用户导入课表"
        }]
      }
      logger.debug(`[ClassTable] 返回渲染数据: ${JSON.stringify(result, null, 2)}`)
      return result
    }
    
    const currentTime = new Date()
    const currentDay = currentTime.getDay() === 0 ? 7 : currentTime.getDay()
    const currentHour = currentTime.getHours()
    const currentMinute = currentTime.getMinutes()
    let userList = []
    
    logger.info(`[ClassTable] 开始处理${userIds.length}个用户的课表数据`)
    
    // 使用Promise.all并行处理用户数据
    const userPromises = userIds.map(async (userId) => {
      let userName = `用户${userId}`
      let avatarUrl = `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=100`
      
      const filePath = getSchedulePath(userId)
      if (!fs.existsSync(filePath)) {
        return {
          userName: userName,
          avatar: avatarUrl,
          hasClass: false,
          NoCourseTitle: "未导入课表",
          NoCourseTip: "该用户尚未导入课表"
        }
      }
      
      try {
        const scheduleData = loadScheduleFromFile(filePath)
        const schedule = scheduleData.schedule || scheduleData // 兼容新旧数据格式
        
        // 获取该用户的开学日期，如果没有则使用默认值
        const userStartDate = scheduleData.startDate || "2025-09-01"
        const currentWeek = calculateCurrentWeek(new Date(userStartDate), currentTime)
        
        const nextClassInfo = findNextClass(schedule, currentWeek, currentDay, currentHour, currentMinute)

        if (!nextClassInfo || nextClassInfo.status === 'noneToday') {
          return {
            userName: (userName || "").length > 16 ? (userName.substring(0, 16) + "...") : userName,
            avatar: avatarUrl,
            hasClass: false,
            type: "空闲",
            typeColor: "#50ff05ff",
            NoCourseTitle: "今日无课",
            NoCourseTip: "好好休息一下吧"
          }
        } else {
          let nowType = "将开始"
          let typeColor = "#ffb700ff"
          if (nextClassInfo.status === 'ongoing') {
            nowType = "上课中"
            typeColor = "#00eeffff"
          }

          // 检查用户是否翘课
          const skipKey = getSkipClassCacheKey(userId)
          let isSkippingClass = false
          try {
            isSkippingClass = !!(await redis.get(skipKey))
          } catch (error) {
            logger.error(`[ClassTable] 检查翘课状态失败: ${error}`)
          }

          // 如果用户翘课且课程状态为'ongoing'或'next'，则显示翘课状态
          if (isSkippingClass && (nextClassInfo.status === 'ongoing' || nextClassInfo.status === 'next')) {
            nowType = "翘课中"
            typeColor = "#ff4757ff"
          }

          // 计算距离课程结束的时间（分钟）
          let timeUntilEnd = null
          if (nextClassInfo.status === 'ongoing') {
            const currentTimeStr = `${currentHour}:${currentMinute}`
            timeUntilEnd = calculateTimeInterval(currentTimeStr, nextClassInfo.endTime)
          }

          return {
            userName: (userName || "").length > 14 ? (userName.substring(0, 14) + "...") : userName,
            avatar: avatarUrl,
            hasClass: true,
            className: (nextClassInfo.courseName || "").length > 10 ? (nextClassInfo.courseName.substring(0, 10) + "...") : nextClassInfo.courseName,
            type: nowType,
            typeColor: typeColor,
            startTime: nextClassInfo.startTime,
            endTime: nextClassInfo.endTime,
            timeUntilEnd: timeUntilEnd
          }
        }
      } catch (error) {
        logger.error(`[ClassTable] 获取用户${userId}的课表数据失败: ${error}`)
        return {
          userName: userName,
          hasClass: false,
          NoCourseTitle: "数据错误",
          NoCourseTip: "获取课表信息时发生错误"
        }
      }
    })
    
    // 等待所有用户处理完成
    const userResults = await Promise.all(userPromises)
    userList.push(...userResults.filter(item => item !== undefined))
    
    // 对用户列表进行排序：先按状态排序，再按上课时间排序
    userList.sort((a, b) => {
      // 定义状态优先级
      const statusPriority = {
        '上课中': 1,
        '翘课中': 2,
        '将开始': 3,
        '空闲': 4
      }
      
      // 获取两个用户的状态
      const statusA = a.hasClass ? a.type : '空闲'
      const statusB = b.hasClass ? b.type : '空闲'
      
      // 按照优先级排序
      const priorityA = statusPriority[statusA] || 999
      const priorityB = statusPriority[statusB] || 999
      
      // 如果状态不同，按状态排序
      if (priorityA !== priorityB) {
        return priorityA - priorityB
      }
      
      // 如果状态相同，按上课时间排序
      // 只有有课的用户才有时间信息
      if (a.hasClass && b.hasClass && a.startTime && b.startTime) {
        // 将时间字符串转换为分钟数进行比较
        const totalMinutesA = getCurrentTimeMinutes(a.startTime)
        const totalMinutesB = getCurrentTimeMinutes(b.startTime)
        
        return totalMinutesA - totalMinutesB
      }
      
      // 如果状态相同但无法按时间排序，保持原顺序
      return 0
    })
    
    // 如果指定了限制数量，只返回前N个用户
    if (limit && limit > 0 && userList.length > limit) {
      userList = userList.slice(0, limit)
    }
    
    const result = {
      list: userList
    }
    logger.debug(`[ClassTable] 返回渲染数据: ${JSON.stringify(result, null, 2)}`)
    return result
  } catch (error) {
    logger.error(`[ClassTable] 获取所有人下一节课渲染数据失败: ${error}`)
    return {
      list: [{
        userName: "系统错误",
        hasClass: false,
        NoCourseTitle: "系统错误",
        NoCourseTip: "获取课表信息时发生错误"
      }]
    }
  }
}

export default {
  getMultipleNextClassRenderData,
  getAllUsersNextClassRenderData,
  getAllUsersWithScheduleFromFiles
}