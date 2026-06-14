// 分类选择器组件
Component({
  properties: {
    categories: {
      type: Array,
      value: []
    },
    selectedId: {
      type: Number,
      value: null
    },
    showAll: {
      type: Boolean,
      value: true
    }
  },

  data: {
    localSelectedId: null
  },

  lifetimes: {
    attached() {
      this.setData({
        localSelectedId: this.properties.selectedId
      })
    }
  },

  observers: {
    'selectedId': function(newVal) {
      this.setData({
        localSelectedId: newVal
      })
    }
  },

  methods: {
    onSelect(e) {
      const id = e.currentTarget.dataset.id
      this.setData({
        localSelectedId: id
      })
      this.triggerEvent('change', { id })
    }
  }
})