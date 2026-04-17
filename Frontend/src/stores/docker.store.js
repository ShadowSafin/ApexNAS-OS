/**

  pullImage: async (image) => {
    set({ containersLoading: true, containersError: null });
    try {
      const result = await dockerService.pullImage(image);
      set({ containersLoading: false });
      return result;
    } catch (error) {
      const errorMsg = error.message || 'Failed to pull image';
      set({ containersError: errorMsg, containersLoading: false });
      throw error;
    }
  },

  /**
   * Toggle create modal
   */
  toggleCreateModal: () => {
    set(state => ({ showCreateModal: !state.showCreateModal }));
  },

  /**
   * Toggle logs modal
   */
  toggleLogsModal: () => {
    set(state => ({ showLogsModal: !state.showLogsModal }));
  },

  /**
   * Clear error
   */
  clearError: () => {
    set({ containersError: null });
  }
}));
