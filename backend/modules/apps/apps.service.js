// Apps service removed as part of Docker decommission.
/**
 * App Installer Service - Phase 7
 * 
 * Modular app installation system using Docker
 * - Load app catalog
 * - Install/start/stop/remove containers
 * - Track installed apps
 * - Validate paths and security
 */

const fs = require('fs');
const path = require('path');
const { execute, ExecutorError } = require('../../lib/executor');
const logger = require('../../lib/logger');

const CATALOG_FILE = path.join(__dirname, 'app-catalog.json');
const INSTALLED_APPS_FILE = path.join(__dirname, '../../data/installed-apps.json');
const STORAGE_BASE = '/mnt/storage';

class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

class AppInstallerService {
  /**
   * Initialize app installer (ensure state files exist)
   */
  static async init() {
    try {
      // Ensure state file directory exists
      const stateDir = path.dirname(INSTALLED_APPS_FILE);
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      // Initialize installed apps file if it doesn't exist
      if (!fs.existsSync(INSTALLED_APPS_FILE)) {
        fs.writeFileSync(INSTALLED_APPS_FILE, JSON.stringify({
          apps: [],
          lastUpdated: new Date().toISOString()
        }));
      }

      logger.info('App Installer Service initialized');
    } catch (err) {
      logger.error('App Installer initialization failed', { error: err.message });
    }
  }

  /**
   * Get app catalog
   */
  static getCatalog() {
    try {
      const catalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf8'));
      return catalog;
    } catch (err) {
      logger.error('Failed to read app catalog', { error: err.message });
      throw new AppError('CATALOG_READ_FAILED', 'Cannot read app catalog');
    }
  }

  /**
   * Get app by ID from catalog
   */
  static getAppById(appId) {
    try {
      const catalog = this.getCatalog();
      const app = catalog.find(a => a.id === appId);
      if (!app) {
        throw new AppError('APP_NOT_FOUND', `App ${appId} not found in catalog`);
      }
      return app;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('CATALOG_READ_FAILED', 'Cannot read app catalog');
    }
  }

  /**
   * Get installed apps state
   */
  static getInstalledApps() {
    try {
      const data = JSON.parse(fs.readFileSync(INSTALLED_APPS_FILE, 'utf8'));
      return data.apps || [];
    } catch (err) {
      logger.error('Failed to read installed apps', { error: err.message });
      throw new AppError('STATE_READ_FAILED', 'Cannot read installed apps state');
    }
  }

  /**
   * Save installed apps state
   */
  static saveInstalledApps(apps) {
    try {
      fs.writeFileSync(INSTALLED_APPS_FILE, JSON.stringify({
        apps,
        lastUpdated: new Date().toISOString()
      }, null, 2));
      logger.info('Installed apps state saved', { count: apps.length });
    } catch (err) {
      logger.error('Failed to save installed apps', { error: err.message });
      throw new AppError('STATE_SAVE_FAILED', 'Cannot save installed apps state');
    }
  }

  /**
   * Validate volumes - ensure all paths are under /mnt/storage
   */
  static validateVolumes(volumes) {
    if (!volumes || !Array.isArray(volumes)) {
      return [];
    }

    for (const volume of volumes) {
      const hostPath = path.normalize(volume.host);
      if (!hostPath.startsWith(STORAGE_BASE) && hostPath !== '/var/run/docker.sock') {
        throw new AppError(
          'INVALID_VOLUME',
          `Volume path ${volume.host} is outside allowed storage path. Only /mnt/storage and /var/run/docker.sock are allowed.`
        );
      }
    }
    return volumes;
  }

  /**
   * Validate ports - ensure they're in valid range
   */
  static validatePorts(ports) {
    if (!ports || !Array.isArray(ports)) {
      return [];
    }

    for (const port of ports) {
      if (port.host < 1024 || port.host > 65535) {
        throw new AppError(
          'INVALID_PORT',
          `Port ${port.host} is outside valid range (1024-65535)`
        );
      }
    }
    return ports;
  }

  /**
   * Create volume mounts for Docker
   */
  static createVolumeMounts(volumes) {
    return volumes.map(v => {
      const hostPath = path.normalize(v.host);
      // Create directory if it doesn't exist
      if (!fs.existsSync(hostPath)) {
        fs.mkdirSync(hostPath, { recursive: true });
      }
      const mode = v.mode || 'rw';
      return `${hostPath}:${v.container}:${mode}`;
    });
  }

  /**
   * Create port mappings for Docker
   */
  static createPortMappings(ports) {
    return ports.map(p => {
      const protocol = p.protocol || 'tcp';
      return `${p.host}:${p.container}/${protocol}`;
    });
  }

  /**
   * Pull Docker image
   */
  static async pullImage(image) {
    try {
      logger.info('Pulling Docker image', { image });
      await execute('docker', ['pull', image], { timeout: 300000 });
      logger.info('Docker image pulled successfully', { image });
    } catch (err) {
      logger.error('Failed to pull Docker image', { image, error: err.message });
      throw new AppError('IMAGE_PULL_FAILED', `Cannot pull image ${image}`);
    }
  }

  /**
   * Install app
   */
  static async installApp(appId, overrideValues = {}) {
    try {
      // Get app from catalog
      const appTemplate = this.getAppById(appId);

      // Validate and prepare volumes
      const volumes = this.validateVolumes(
        overrideValues.volumes || appTemplate.volumes
      );

      // Validate and prepare ports
      const ports = this.validatePorts(
        overrideValues.ports || appTemplate.ports
      );

      // Pull image
      await this.pullImage(appTemplate.image);

      // Create volume mounts
      const volumeMounts = this.createVolumeMounts(volumes);

      // Create port mappings
      const portMappings = this.createPortMappings(ports);

      // Prepare environment variables
      const environmentVars = [];
      const baseEnv = appTemplate.environment || [];
      const overrideEnv = overrideValues.environment || [];

      for (const env of baseEnv) {
        environmentVars.push('-e');
        environmentVars.push(`${env.key}=${env.value}`);
      }
      for (const env of overrideEnv) {
        environmentVars.push('-e');
        environmentVars.push(`${env.key}=${env.value}`);
      }

      // Build docker run command
      const dockerArgs = ['run', '-d'];

      // Add name
      dockerArgs.push('--name', `NAS-${appId}-${Date.now()}`);

      // Add restart policy
      dockerArgs.push('--restart', appTemplate.restart || 'unless-stopped');

      // Add ports
      for (const portMapping of portMappings) {
        dockerArgs.push('-p', portMapping);
      }

      // Add volumes
      for (const volumeMount of volumeMounts) {
        dockerArgs.push('-v', volumeMount);
      }

      // Add environment variables
      dockerArgs.push(...environmentVars);

      // Ensure no privileged containers
      if (appTemplate.privileged === true) {
        throw new AppError(
          'PRIVILEGED_DENIED',
          'Privileged containers are not allowed for security reasons'
        );
      }

      // Add image
      dockerArgs.push(appTemplate.image);

      // Create container
      logger.info('Creating Docker container', { appId, image: appTemplate.image });
      const { stdout: containerId } = await execute('docker', dockerArgs, {
        timeout: 60000
      });

      const containerIdTrimmed = containerId.trim();

      // Update state
      const apps = this.getInstalledApps();
      apps.push({
        id: appId,
        containerId: containerIdTrimmed,
        name: appTemplate.name,
        image: appTemplate.image,
        ports: ports,
        volumes: volumes,
        status: 'running',
        installedAt: new Date().toISOString()
      });
      this.saveInstalledApps(apps);

      logger.info('App installed successfully', { appId, containerId: containerIdTrimmed });
      return {
        success: true,
        appId,
        containerId: containerIdTrimmed,
        message: `${appTemplate.name} installed successfully`
      };
    } catch (err) {
      logger.error('Failed to install app', { appId, error: err.message });
      if (err instanceof AppError) throw err;
      throw new AppError('INSTALL_FAILED', `Cannot install app ${appId}`);
    }
  }

  /**
   * Start app container
   */
  static async startApp(containerId) {
    try {
      logger.info('Starting container', { containerId });
      await execute('docker', ['start', containerId], { timeout: 10000 });

      // Update state
      const apps = this.getInstalledApps();
      const app = apps.find(a => a.containerId === containerId);
      if (app) {
        app.status = 'running';
        this.saveInstalledApps(apps);
      }

      logger.info('Container started', { containerId });
      return { success: true, message: 'Container started' };
    } catch (err) {
      logger.error('Failed to start container', { containerId, error: err.message });
      throw new AppError('START_FAILED', 'Cannot start container');
    }
  }

  /**
   * Stop app container
   */
  static async stopApp(containerId) {
    try {
      logger.info('Stopping container', { containerId });
      await execute('docker', ['stop', containerId], { timeout: 10000 });

      // Update state
      const apps = this.getInstalledApps();
      const app = apps.find(a => a.containerId === containerId);
      if (app) {
        app.status = 'stopped';
        this.saveInstalledApps(apps);
      }

      logger.info('Container stopped', { containerId });
      return { success: true, message: 'Container stopped' };
    } catch (err) {
      logger.error('Failed to stop container', { containerId, error: err.message });
      throw new AppError('STOP_FAILED', 'Cannot stop container');
    }
  }

  /**
   * Remove app container
   */
  static async removeApp(containerId, removeVolumes = false) {
    try {
      // Stop container first
      try {
        await execute('docker', ['stop', containerId], { timeout: 10000 });
      } catch (err) {
        logger.warn('Container already stopped', { containerId });
      }

      // Remove container
      logger.info('Removing container', { containerId, removeVolumes });
      const args = ['rm', containerId];
      if (removeVolumes) {
        args.push('-v');
      }
      await execute('docker', args, { timeout: 10000 });

      // Update state
      const apps = this.getInstalledApps();
      const updatedApps = apps.filter(a => a.containerId !== containerId);
      this.saveInstalledApps(updatedApps);

      logger.info('Container removed', { containerId });
      return { success: true, message: 'Container removed' };
    } catch (err) {
      logger.error('Failed to remove container', { containerId, error: err.message });
      throw new AppError('REMOVE_FAILED', 'Cannot remove container');
    }
  }

  /**
   * Get installed app by container ID
   */
  static getInstalledApp(containerId) {
    const apps = this.getInstalledApps();
    return apps.find(a => a.containerId === containerId);
  }

  /**
   * Sync app state with Docker
   */
  static async syncAppState() {
    try {
      const { stdout } = await execute(
        'docker',
        ['ps', '-a', '--format', '{{.ID}}:{{.Status}}'],
        { timeout: 10000 }
      );

      const containerStates = new Map();
      stdout.split('\n').forEach(line => {
        const [id, status] = line.split(':');
        if (id && status) {
          containerStates.set(id.substring(0, 12), status.includes('Up') ? 'running' : 'stopped');
        }
      });

      // Update app states
      const apps = this.getInstalledApps();
      let changed = false;
      for (const app of apps) {
        const state = containerStates.get(app.containerId.substring(0, 12));
        if (state && app.status !== state) {
          app.status = state;
          changed = true;
        }
      }

      if (changed) {
        this.saveInstalledApps(apps);
      }

      return apps;
    } catch (err) {
      logger.error('Failed to sync app state', { error: err.message });
      return this.getInstalledApps();
    }
  }

  /**
   * Search Docker Hub for images
   * Uses Docker Hub API /search endpoint
   */
  static async searchDockerHub(query, limit = 25) {
    try {
      if (!query || query.trim().length === 0) {
        return {
          query: '',
          count: 0,
          results: []
        };
      }

      logger.info('Searching Docker Hub', { query, limit });

      // Use Node.js native fetch instead of external library
      const https = require('https');
      
      return new Promise((resolve, reject) => {
        const searchQuery = encodeURIComponent(query.trim());
        const url = `https://hub.docker.com/v2/search/repositories/?query=${searchQuery}&page_size=${Math.min(limit, 100)}`;

        https.get(url, {
          headers: {
            'User-Agent': 'ApexNAS/1.0'
          },
          timeout: 10000
        }, (res) => {
          let data = '';

          res.on('data', chunk => {
            data += chunk;
          });

          res.on('end', () => {
            try {
              if (res.statusCode === 200) {
                const response = JSON.parse(data);
                const results = (response.results || []).map(repo => ({
                  name: repo.name,
                  description: repo.description || '',
                  stars: repo.star_count || 0,
                  official: repo.is_official || false,
                  private: repo.is_private || false,
                  pullCount: repo.pull_count || 0,
                  image: repo.name
                }));

                logger.info('Docker Hub search completed', { 
                  query, 
                  resultCount: results.length 
                });

                resolve({
                  query: query.trim(),
                  count: results.length,
                  results
                });
              } else {
                throw new Error(`Docker Hub API returned ${res.statusCode}`);
              }
            } catch (err) {
              logger.error('Failed to parse Docker Hub response', { error: err.message });
              reject(new AppError('SEARCH_FAILED', 'Failed to search Docker Hub'));
            }
          });
        }).on('error', (err) => {
          logger.error('Docker Hub search error', { error: err.message, query });
          reject(new AppError('SEARCH_ERROR', 'Cannot connect to Docker Hub. Please try again later.'));
        });
      });
    } catch (err) {
      logger.error('Docker Hub search failed', { query, error: err.message });
      if (err instanceof AppError) throw err;
      throw new AppError('SEARCH_FAILED', 'Failed to search Docker Hub');
    }
  }

  /**
   * Install app from Docker Hub with custom configuration
   */
  static async installDockerHubApp(config) {
    try {
      const { image, name, ports = [], volumes = [], env = {} } = config;

      if (!image || !name) {
        throw new AppError('INVALID_CONFIG', 'Image name and container name required');
      }

      logger.info('Installing Docker Hub app', { image, name });

      // Validate image name format
      const imageRegex = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[a-z0-9]+(?:[._-][a-z0-9]+)*)?$/i;
      if (!imageRegex.test(image)) {
        throw new AppError('INVALID_IMAGE', 'Invalid image name format');
      }

      // Validate container name
      if (!/^[a-z0-9_-]{1,63}$/.test(name)) {
        throw new AppError('INVALID_NAME', 'Container name must be lowercase alphanumeric with hyphen/underscore (max 63 chars)');
      }

      // Validate volumes
      if (Array.isArray(volumes)) {
        for (const vol of volumes) {
          if (vol.host && !vol.host.startsWith(STORAGE_BASE)) {
            throw new AppError('INVALID_VOLUME', `Volume path must be under ${STORAGE_BASE}`);
          }
        }
      }

      // Validate ports
      if (Array.isArray(ports)) {
        for (const port of ports) {
          const portNum = parseInt(port.split(':')[0], 10);
          if (portNum < 1024 || portNum > 65535) {
            throw new AppError('INVALID_PORT', 'Port must be between 1024-65535');
          }
        }
      }

      // Pull image
      await this.pullImage(image);

      // Create volume mounts
      const volumeMounts = [];
      if (Array.isArray(volumes)) {
        for (const vol of volumes) {
          if (!fs.existsSync(vol.host)) {
            fs.mkdirSync(vol.host, { recursive: true, mode: 0o755 });
          }
          volumeMounts.push(`${vol.host}:${vol.container}:${vol.readOnly ? 'ro' : 'rw'}`);
        }
      }

      // Build docker run command
      const dockerArgs = ['run', '-d'];
      dockerArgs.push('--name', name);
      dockerArgs.push('--restart', 'unless-stopped');

      // Add ports
      for (const port of ports) {
        dockerArgs.push('-p', port);
      }

      // Add volumes
      for (const mount of volumeMounts) {
        dockerArgs.push('-v', mount);
      }

      // Add environment variables
      for (const [key, value] of Object.entries(env)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }

      // Security: read-only root filesystem and capabilities dropping
      dockerArgs.push('--read-only');
      dockerArgs.push('--cap-drop=ALL');
      dockerArgs.push('--security-opt=no-new-privileges:true');

      // Add image
      dockerArgs.push(image);

      // Create container
      logger.info('Creating Docker Hub container', { name, image });
      const { stdout: containerId } = await execute('docker', dockerArgs, {
        timeout: 60000
      });

      const containerIdTrimmed = containerId.trim();

      // Update state
      const apps = this.getInstalledApps();
      apps.push({
        id: `dockerhub-${Date.now()}`,
        containerId: containerIdTrimmed,
        name: name,
        image: image,
        ports: ports,
        volumes: volumes,
        status: 'running',
        source: 'docker-hub',
        installedAt: new Date().toISOString()
      });
      this.saveInstalledApps(apps);

      logger.info('Docker Hub app installed successfully', { name, containerId: containerIdTrimmed });
      return {
        success: true,
        containerId: containerIdTrimmed,
        name: name,
        message: `${name} installed successfully from Docker Hub`
      };
    } catch (err) {
      logger.error('Failed to install Docker Hub app', { error: err.message });
      if (err instanceof AppError) throw err;
      throw new AppError('INSTALL_FAILED', 'Failed to install Docker Hub app');
    }
  }
}

module.exports = { AppInstallerService, AppError };
