import fs from "node:fs"
import path from "node:path"

const DATA_DIR = path.join("./plugins", "classtable", "data")
const USER_DATA_DIR = path.join(DATA_DIR, "users")
const GROUP_DATA_DIR = path.join(DATA_DIR, "groups")

/**
 * 获取群组中多个用户的下一节课信息用于HTML渲染
 * @param {Object} e - 消息事件对象
 * @returns {Object} 包含渲染所需所有数据的对象
 */
export async function getMultipleNextClassRenderData(e) {
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
    const userList = []
    
    logger.info(`[ClassTable] 开始处理${userIds.length}个用户的课表数据`)
    
    for (const userId of userIds) {
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
        userList.push({
          userName: userName,
          avatar: avatarUrl,
          hasClass: false,
          NoCourseTitle: "未导入课表",
          NoCourseTip: "该用户尚未导入课表"
        })
        continue
      }
      
      try {
        const scheduleData = loadScheduleFromFile(filePath)
        const schedule = scheduleData.schedule || scheduleData // 兼容新旧数据格式
        
        // 获取该用户的开学日期，如果没有则使用默认值
        const userStartDate = scheduleData.startDate || "2025-09-01"
        const currentWeek = calculateCurrentWeek(new Date(userStartDate), currentTime)
        
        const nextClassInfo = findNextClass(schedule, currentWeek, currentDay, currentHour, currentMinute)

        if (!nextClassInfo || nextClassInfo.status === 'noneToday') {
          userList.push({
            userName: (userName || "").length > 14 ? (userName.substring(0, 14) + "···") : userName,
            avatar: avatarUrl,
            hasClass: false,
            type: "空闲",
            typeColor: "#50ff05ff",
            NoCourseTitle: "今日课程已结束",
            NoCourseTip: "快去出勤吧"
          })
        } else {
          let nowType = "将开始"
          let typeColor = "#ffb700ff"
          if (nextClassInfo.status === 'ongoing') {
            nowType = "上课中"
            typeColor = "#00eeffff"
          }

          userList.push({
            userName: (userName || "").length > 14 ? (userName.substring(0, 14) + "···") : userName,
            avatar: avatarUrl,
            hasClass: true,
            className: (nextClassInfo.courseName || "").length > 9 ? (nextClassInfo.courseName.substring(0, 9) + "···") : nextClassInfo.courseName,
            type: nowType,
            typeColor: typeColor,
            startTime: nextClassInfo.startTime,
            endTime: nextClassInfo.endTime
          })
        }
      } catch (error) {
        logger.error(`[ClassTable] 获取用户${userId}的课表数据失败: ${error}`)
        userList.push({
          userName: userName,
          hasClass: false,
          NoCourseTitle: "数据错误",
          NoCourseTip: "获取课表信息时发生错误"
        })
      }
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
  for (const cls of todayClasses) {
    const [startHour, startMinute] = cls.startTime.split(':').map(Number)
    const [endHour, endMinute] = cls.endTime.split(':').map(Number)
    const afterStart = (currentHour > startHour) || (currentHour === startHour && currentMinute >= startMinute)
    const beforeEnd = (currentHour < endHour) || (currentHour === endHour && currentMinute < endMinute)
    if (afterStart && beforeEnd) {
      return {
        ...cls,
        week: currentWeek,
        status: 'ongoing'
      }
    }
  }

  // 没有正在上的课程，找下一节（仅限今天）
  for (const cls of todayClasses) {
    const [startHour, startMinute] = cls.startTime.split(':').map(Number)
    if (startHour > currentHour || (startHour === currentHour && startMinute > currentMinute)) {
      return {
        ...cls,
        week: currentWeek,
        status: 'next'
      }
    }
  }

  // 今天有课程但已经结束
  return { status: 'noneToday' }
}

export default {
  getMultipleNextClassRenderData
}