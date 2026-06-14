Component({
  properties: {
    task: {
      type: Object,
      value: {}
    }
  },

  methods: {
    onTap() {
      this.triggerEvent('tap', { task: this.properties.task });
    }
  }
});