export type DiaryInput = {
  completedTasks: string;
  problems: string;
  nextPlan: string;
};

export type DiaryData = DiaryInput & {
  id: string;
  date: string;
  createdAt: string;
  updatedAt: string;
};
