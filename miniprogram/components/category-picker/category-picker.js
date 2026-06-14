Component({
  properties: {
    categories: {
      type: Array,
      value: []
    },
    selectedId: {
      type: Number,
      value: null
    }
  },

  methods: {
    onSelect(e) {
      const id = e.currentTarget.dataset.id;
      this.triggerEvent('change', { id });
    }
  }
});