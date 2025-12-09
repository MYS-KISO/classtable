/**
 * 简单的内存缓存实现
 */
class MemoryCache {
  constructor(maxSize = 100, defaultTTL = 5 * 60 * 1000) { // 默认5分钟过期
    this.cache = new Map()
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL
    this.accessCounts = new Map()
  }

  /**
   * 获取缓存项
   * @param {string} key - 缓存键
   * @returns {*} 缓存值，不存在返回undefined
   */
  get(key) {
    const item = this.cache.get(key)
    if (!item) return undefined

    // 检查是否过期
    if (Date.now() > item.expireAt) {
      this.delete(key)
      return undefined
    }

    // 更新访问计数（用于LRU）
    this.accessCounts.set(key, (this.accessCounts.get(key) || 0) + 1)
    return item.value
  }

  /**
   * 设置缓存项
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 过期时间（毫秒），可选
   */
  set(key, value, ttl = this.defaultTTL) {
    // 如果缓存已满，清理最少使用的项
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    this.cache.set(key, {
      value,
      expireAt: Date.now() + ttl
    })
  }

  /**
   * 删除缓存项
   * @param {string} key - 缓存键
   */
  delete(key) {
    this.cache.delete(key)
    this.accessCounts.delete(key)
  }

  /**
   * 清理最少使用的缓存项（LRU）
   */
  evictLRU() {
    let minKey = null
    let minCount = Infinity

    for (const [key, count] of this.accessCounts) {
      if (count < minCount) {
        minCount = count
        minKey = key
      }
    }

    if (minKey) {
      this.delete(minKey)
    }
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear()
    this.accessCounts.clear()
  }

  /**
   * 获取缓存大小
   * @returns {number} 缓存项数量
   */
  size() {
    return this.cache.size
  }
}

/**
 * 群组查询结果缓存
 */
export const groupQueryCache = new MemoryCache(50, 2 * 60 * 1000) // 2分钟过期

/**
 * 用户课表数据缓存
 */
export const userScheduleCache = new MemoryCache(100, 10 * 60 * 1000) // 10分钟过期

/**
 * 生成群组查询缓存键
 * @param {string} groupId - 群组ID
 * @returns {string} 缓存键
 */
export function getGroupCacheKey(groupId) {
  return `group_query:${groupId}`
}

/**
 * 生成用户课表缓存键
 * @param {string} userId - 用户ID
 * @returns {string} 缓存键
 */
export function getUserScheduleCacheKey(userId) {
  return `user_schedule:${userId}`
}

/**
 * 生成翘课状态缓存键
 * @param {string} userId - 用户ID
 * @returns {string} 缓存键
 */
export function getSkipClassCacheKey(userId) {
  return `skip_class:${userId}`
}

export default {
  MemoryCache,
  groupQueryCache,
  userScheduleCache,
  getGroupCacheKey,
  getUserScheduleCacheKey,
  getSkipClassCacheKey
}