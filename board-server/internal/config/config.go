package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type Project struct {
	ID          string `yaml:"id" json:"id"`
	Name        string `yaml:"name" json:"name"`
	Path        string `yaml:"path" json:"path"`
	Description string `yaml:"description" json:"description"`
}

type ProjectsConfig struct {
	Projects []Project `yaml:"projects"`
}

type BoardConfig struct {
	NextID          int    `yaml:"next_id"`
	DefaultTier     string `yaml:"default_tier"`
}

type AgentEntry struct {
	Name    string `yaml:"name" json:"name"`
	Skill   string `yaml:"skill" json:"skill"`
	Type    string `yaml:"type" json:"type"`
	Enabled bool   `yaml:"enabled" json:"enabled"`
}

type AgentsConfig struct {
	Agents []AgentEntry `yaml:"agents"`
}

func LoadProjects(scRoot string) ([]Project, error) {
	data, err := os.ReadFile(filepath.Join(scRoot, "config", "projects.yaml"))
	if err != nil {
		return nil, err
	}
	var cfg ProjectsConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return cfg.Projects, nil
}

func SaveProjects(scRoot string, projects []Project) error {
	cfg := ProjectsConfig{Projects: projects}
	data, err := yaml.Marshal(&cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(scRoot, "config", "projects.yaml"), data, 0644)
}

func LoadBoardConfig(scRoot string) (*BoardConfig, error) {
	data, err := os.ReadFile(filepath.Join(scRoot, "config", "board.yaml"))
	if err != nil {
		return nil, err
	}
	var cfg BoardConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func SaveBoardConfig(scRoot string, cfg *BoardConfig) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(scRoot, "config", "board.yaml"), data, 0644)
}

func LoadAgents(scRoot string) ([]AgentEntry, error) {
	data, err := os.ReadFile(filepath.Join(scRoot, "config", "agents.yaml"))
	if err != nil {
		return nil, err
	}
	var cfg AgentsConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return cfg.Agents, nil
}
