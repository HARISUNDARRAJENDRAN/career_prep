'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { ResumeProfile, ExperienceItem, EducationItem, ProjectItem, CertificationItem } from '@/lib/services/career-automation-client';

interface ResumeFormProps {
  profile: ResumeProfile;
  onChange: (profile: ResumeProfile) => void;
}

export function ResumeForm({ profile, onChange }: ResumeFormProps) {
  const [openSections, setOpenSections] = useState(['contact', 'summary']);

  const updateField = useCallback(
    <K extends keyof ResumeProfile>(field: K, value: ResumeProfile[K]) => {
      onChange({ ...profile, [field]: value });
    },
    [profile, onChange]
  );

  const updateExperience = useCallback(
    (index: number, updates: Partial<ExperienceItem>) => {
      const updated = [...profile.experience];
      updated[index] = { ...updated[index], ...updates };
      onChange({ ...profile, experience: updated });
    },
    [profile, onChange]
  );

  const addExperience = useCallback(() => {
    onChange({
      ...profile,
      experience: [
        ...profile.experience,
        {
          title: '',
          company: '',
          location: '',
          start_date: '',
          end_date: 'Present',
          bullets: [''],
        },
      ],
    });
  }, [profile, onChange]);

  const removeExperience = useCallback(
    (index: number) => {
      onChange({
        ...profile,
        experience: profile.experience.filter((_, i) => i !== index),
      });
    },
    [profile, onChange]
  );

  const updateEducation = useCallback(
    (index: number, updates: Partial<EducationItem>) => {
      const updated = [...profile.education];
      updated[index] = { ...updated[index], ...updates };
      onChange({ ...profile, education: updated });
    },
    [profile, onChange]
  );

  const addEducation = useCallback(() => {
    onChange({
      ...profile,
      education: [
        ...profile.education,
        {
          institution: '',
          degree: '',
          field: '',
          graduation_date: '',
          gpa: '',
        },
      ],
    });
  }, [profile, onChange]);

  const removeEducation = useCallback(
    (index: number) => {
      onChange({
        ...profile,
        education: profile.education.filter((_, i) => i !== index),
      });
    },
    [profile, onChange]
  );

  const updateProject = useCallback(
    (index: number, updates: Partial<ProjectItem>) => {
      const updated = [...profile.projects];
      updated[index] = { ...updated[index], ...updates };
      onChange({ ...profile, projects: updated });
    },
    [profile, onChange]
  );

  const addProject = useCallback(() => {
    onChange({
      ...profile,
      projects: [
        ...profile.projects,
        {
          name: '',
          date: '',
          url: '',
          technologies: [],
          bullets: [''],
        },
      ],
    });
  }, [profile, onChange]);

  const removeProject = useCallback(
    (index: number) => {
      onChange({
        ...profile,
        projects: profile.projects.filter((_, i) => i !== index),
      });
    },
    [profile, onChange]
  );

  const updateBullet = useCallback(
    (
      type: 'experience' | 'projects',
      itemIndex: number,
      bulletIndex: number,
      value: string
    ) => {
      if (type === 'experience') {
        const updated = [...profile.experience];
        const bullets = [...updated[itemIndex].bullets];
        bullets[bulletIndex] = value;
        updated[itemIndex] = { ...updated[itemIndex], bullets };
        onChange({ ...profile, experience: updated });
      } else {
        const updated = [...profile.projects];
        const bullets = [...updated[itemIndex].bullets];
        bullets[bulletIndex] = value;
        updated[itemIndex] = { ...updated[itemIndex], bullets };
        onChange({ ...profile, projects: updated });
      }
    },
    [profile, onChange]
  );

  const addBullet = useCallback(
    (type: 'experience' | 'projects', itemIndex: number) => {
      if (type === 'experience') {
        const updated = [...profile.experience];
        updated[itemIndex] = {
          ...updated[itemIndex],
          bullets: [...updated[itemIndex].bullets, ''],
        };
        onChange({ ...profile, experience: updated });
      } else {
        const updated = [...profile.projects];
        updated[itemIndex] = {
          ...updated[itemIndex],
          bullets: [...updated[itemIndex].bullets, ''],
        };
        onChange({ ...profile, projects: updated });
      }
    },
    [profile, onChange]
  );

  const removeBullet = useCallback(
    (type: 'experience' | 'projects', itemIndex: number, bulletIndex: number) => {
      if (type === 'experience') {
        const updated = [...profile.experience];
        updated[itemIndex] = {
          ...updated[itemIndex],
          bullets: updated[itemIndex].bullets.filter((_, i) => i !== bulletIndex),
        };
        onChange({ ...profile, experience: updated });
      } else {
        const updated = [...profile.projects];
        updated[itemIndex] = {
          ...updated[itemIndex],
          bullets: updated[itemIndex].bullets.filter((_, i) => i !== bulletIndex),
        };
        onChange({ ...profile, projects: updated });
      }
    },
    [profile, onChange]
  );

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={setOpenSections}
          className="space-y-4"
        >
          {/* Contact Information */}
          <AccordionItem value="contact" className="rounded-lg border px-4">
            <AccordionTrigger className="hover:no-underline">
              <span className="font-semibold">Contact Information</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={profile.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="John Doe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    placeholder="john@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={profile.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={profile.location || ''}
                    onChange={(e) => updateField('location', e.target.value)}
                    placeholder="San Francisco, CA"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="linkedin">LinkedIn</Label>
                  <Input
                    id="linkedin"
                    value={profile.linkedin || ''}
                    onChange={(e) => updateField('linkedin', e.target.value)}
                    placeholder="linkedin.com/in/johndoe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github">GitHub</Label>
                  <Input
                    id="github"
                    value={profile.github || ''}
                    onChange={(e) => updateField('github', e.target.value)}
                    placeholder="github.com/johndoe"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="portfolio">Portfolio</Label>
                  <Input
                    id="portfolio"
                    value={profile.portfolio || ''}
                    onChange={(e) => updateField('portfolio', e.target.value)}
                    placeholder="johndoe.dev"
                  />
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Professional Summary */}
          <AccordionItem value="summary" className="rounded-lg border px-4">
            <AccordionTrigger className="hover:no-underline">
              <span className="font-semibold">Professional Summary</span>
            </AccordionTrigger>
            <AccordionContent className="pt-4">
              <Textarea
                value={profile.summary || ''}
                onChange={(e) => updateField('summary', e.target.value)}
                placeholder="A brief summary highlighting your key qualifications, experience, and career goals..."
                className="min-h-[120px]"
              />
            </AccordionContent>
          </AccordionItem>

          {/* Work Experience */}
          <AccordionItem value="experience" className="rounded-lg border px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Work Experience</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {profile.experience.length}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              {profile.experience.map((exp, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground" />
                        <CardTitle className="text-base">
                          {exp.title || exp.company || `Position ${index + 1}`}
                        </CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeExperience(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Job Title</Label>
                        <Input
                          value={exp.title}
                          onChange={(e) =>
                            updateExperience(index, { title: e.target.value })
                          }
                          placeholder="Software Engineer"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Company</Label>
                        <Input
                          value={exp.company}
                          onChange={(e) =>
                            updateExperience(index, { company: e.target.value })
                          }
                          placeholder="Tech Company Inc."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Location</Label>
                        <Input
                          value={exp.location || ''}
                          onChange={(e) =>
                            updateExperience(index, { location: e.target.value })
                          }
                          placeholder="San Francisco, CA"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Start Date</Label>
                          <Input
                            value={exp.start_date}
                            onChange={(e) =>
                              updateExperience(index, { start_date: e.target.value })
                            }
                            placeholder="Jan 2022"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Input
                            value={exp.end_date}
                            onChange={(e) =>
                              updateExperience(index, { end_date: e.target.value })
                            }
                            placeholder="Present"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Key Accomplishments</Label>
                      {exp.bullets.map((bullet, bulletIndex) => (
                        <div key={bulletIndex} className="flex gap-2">
                          <Input
                            value={bullet}
                            onChange={(e) =>
                              updateBullet(
                                'experience',
                                index,
                                bulletIndex,
                                e.target.value
                              )
                            }
                            placeholder="Describe an achievement using action verbs and metrics..."
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              removeBullet('experience', index, bulletIndex)
                            }
                            className="shrink-0"
                            disabled={exp.bullets.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addBullet('experience', index)}
                        className="mt-2"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Bullet
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" onClick={addExperience} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Experience
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Education */}
          <AccordionItem value="education" className="rounded-lg border px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Education</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {profile.education.length}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              {profile.education.map((edu, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {edu.institution || `Education ${index + 1}`}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeEducation(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Institution</Label>
                        <Input
                          value={edu.institution}
                          onChange={(e) =>
                            updateEducation(index, { institution: e.target.value })
                          }
                          placeholder="Stanford University"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Degree</Label>
                        <Input
                          value={edu.degree}
                          onChange={(e) =>
                            updateEducation(index, { degree: e.target.value })
                          }
                          placeholder="Bachelor of Science"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Field of Study</Label>
                        <Input
                          value={edu.field || ''}
                          onChange={(e) =>
                            updateEducation(index, { field: e.target.value })
                          }
                          placeholder="Computer Science"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-2">
                          <Label>Graduation</Label>
                          <Input
                            value={edu.graduation_date}
                            onChange={(e) =>
                              updateEducation(index, {
                                graduation_date: e.target.value,
                              })
                            }
                            placeholder="May 2024"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>GPA</Label>
                          <Input
                            value={edu.gpa || ''}
                            onChange={(e) =>
                              updateEducation(index, { gpa: e.target.value })
                            }
                            placeholder="3.8/4.0"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" onClick={addEducation} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Education
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Skills */}
          <AccordionItem value="skills" className="rounded-lg border px-4">
            <AccordionTrigger className="hover:no-underline">
              <span className="font-semibold">Skills</span>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>Technical Skills</Label>
                <Textarea
                  value={profile.skills?.technical?.join(', ') || ''}
                  onChange={(e) =>
                    updateField('skills', {
                      technical: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      soft: profile.skills?.soft || [],
                      languages: profile.skills?.languages || [],
                    })
                  }
                  placeholder="JavaScript, TypeScript, React, Node.js, Python..."
                />
                <p className="text-xs text-muted-foreground">
                  Separate skills with commas
                </p>
              </div>
              <div className="space-y-2">
                <Label>Soft Skills</Label>
                <Textarea
                  value={profile.skills?.soft?.join(', ') || ''}
                  onChange={(e) =>
                    updateField('skills', {
                      technical: profile.skills?.technical || [],
                      soft: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                      languages: profile.skills?.languages || [],
                    })
                  }
                  placeholder="Leadership, Communication, Problem Solving..."
                />
              </div>
              <div className="space-y-2">
                <Label>Languages</Label>
                <Input
                  value={profile.skills?.languages?.join(', ') || ''}
                  onChange={(e) =>
                    updateField('skills', {
                      technical: profile.skills?.technical || [],
                      soft: profile.skills?.soft || [],
                      languages: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="English (Native), Spanish (Fluent)..."
                />
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Projects */}
          <AccordionItem value="projects" className="rounded-lg border px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Projects</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {profile.projects.length}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              {profile.projects.map((proj, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {proj.name || `Project ${index + 1}`}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProject(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Project Name</Label>
                        <Input
                          value={proj.name}
                          onChange={(e) =>
                            updateProject(index, { name: e.target.value })
                          }
                          placeholder="My Awesome Project"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Date</Label>
                        <Input
                          value={proj.date || ''}
                          onChange={(e) =>
                            updateProject(index, { date: e.target.value })
                          }
                          placeholder="2024"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>URL</Label>
                        <Input
                          value={proj.url || ''}
                          onChange={(e) =>
                            updateProject(index, { url: e.target.value })
                          }
                          placeholder="https://github.com/username/project"
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Technologies</Label>
                        <Input
                          value={proj.technologies?.join(', ') || ''}
                          onChange={(e) =>
                            updateProject(index, {
                              technologies: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="React, Node.js, PostgreSQL..."
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      {proj.bullets.map((bullet, bulletIndex) => (
                        <div key={bulletIndex} className="flex gap-2">
                          <Input
                            value={bullet}
                            onChange={(e) =>
                              updateBullet('projects', index, bulletIndex, e.target.value)
                            }
                            placeholder="Describe what the project does and your contributions..."
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeBullet('projects', index, bulletIndex)}
                            className="shrink-0"
                            disabled={proj.bullets.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addBullet('projects', index)}
                        className="mt-2"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Bullet
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Button variant="outline" onClick={addProject} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Project
              </Button>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </ScrollArea>
  );
}
