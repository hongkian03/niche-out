#define _GNU_SOURCE
#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0602
#endif
#include <node_api.h>
#include <stdbool.h>
#include <stdint.h>
#ifdef _WIN32
#include <windows.h>
static HANDLE job = NULL;
#elif defined(__APPLE__)
#include <mach/mach_time.h>
#include <IOKit/pwr_mgt/IOPMLib.h>
static IOPMAssertionID assertion = kIOPMNullAssertionID;
#else
#include <time.h>
#include <unistd.h>
#include <sys/wait.h>
#include <signal.h>
#include <fcntl.h>
static pid_t inhibitor = -1;
static int inhibitor_input = -1;
#endif

static napi_value number(napi_env env, double n) { napi_value result; napi_create_double(env,n,&result); return result; }
static napi_value napiBool(napi_env env, bool b) { napi_value result; napi_get_boolean(env,b,&result); return result; }
static napi_value now(napi_env env, napi_callback_info info) {
  (void)info;
#ifdef _WIN32
  return number(env,(double)GetTickCount64());
#elif defined(__APPLE__)
  mach_timebase_info_data_t base;
  if (mach_timebase_info(&base) != KERN_SUCCESS) { napi_throw_error(env,NULL,"Continuous clock unavailable"); return NULL; }
  return number(env,(double)mach_continuous_time()*base.numer/base.denom/1000000.0);
#else
  struct timespec t;
  if (clock_gettime(CLOCK_BOOTTIME,&t)) { napi_throw_error(env,NULL,"Continuous clock unavailable"); return NULL; }
  return number(env,t.tv_sec*1000.0+t.tv_nsec/1000000.0);
#endif
}
static bool power(bool active) {
#ifdef _WIN32
  return SetThreadExecutionState(ES_CONTINUOUS | (active ? ES_SYSTEM_REQUIRED : 0)) != 0;
#elif defined(__APPLE__)
  if (active && assertion == kIOPMNullAssertionID)
    return IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleSystemSleep,kIOPMAssertionLevelOn,CFSTR("Niche Out active game"),&assertion) == kIOReturnSuccess;
  if (!active && assertion != kIOPMNullAssertionID) { IOReturn r=IOPMAssertionRelease(assertion); assertion=kIOPMNullAssertionID; return r==kIOReturnSuccess; }
  return true;
#else
  if (!active && inhibitor > 0) {
    close(inhibitor_input); inhibitor_input=-1;
    /* cat observes EOF even after abrupt parent death; logind releases its FD. */
    kill(inhibitor,SIGTERM);
    for(int i=0;i<25;i++){if(waitpid(inhibitor,NULL,WNOHANG)==inhibitor){inhibitor=-1;return true;}usleep(10000);}
    kill(inhibitor,SIGKILL); waitpid(inhibitor,NULL,0); inhibitor=-1;
    return true;
  }
  if (active && inhibitor < 0) {
    int input[2]; if(pipe2(input,O_CLOEXEC)) return false;
    pid_t child=fork();
    if (child==0) {
      dup2(input[0],STDIN_FILENO); close(input[0]); close(input[1]);
      int null=open("/dev/null",O_RDWR); if(null>=0){dup2(null,STDOUT_FILENO);dup2(null,STDERR_FILENO);close(null);}
      execl("/usr/bin/systemd-inhibit","systemd-inhibit","--what=idle","--mode=block","--who=Niche Out","--why=Active game","--no-ask-password","/bin/cat",(char*)NULL);
      _exit(127);
    }
    close(input[0]);
    if(child<0){close(input[1]);return false;}
    inhibitor=child; inhibitor_input=input[1];
  }
  return true;
#endif
}
static napi_value set_active(napi_env env,napi_callback_info info) {
  size_t count=1; napi_value args[1]; bool active=false;
  napi_get_cb_info(env,info,&count,args,NULL,NULL);
  if(count!=1 || napi_get_value_bool(env,args[0],&active)!=napi_ok){napi_throw_type_error(env,NULL,"active must be boolean");return NULL;}
  return napiBool(env,power(active));
}
static napi_value power_healthy(napi_env env,napi_callback_info info) {
  (void)info;
#if !defined(_WIN32) && !defined(__APPLE__)
  if(inhibitor>0 && waitpid(inhibitor,NULL,WNOHANG)==inhibitor){close(inhibitor_input);inhibitor_input=-1;inhibitor=-1;return napiBool(env,false);}
#endif
  return napiBool(env,true);
}
static napi_value own_process(napi_env env,napi_callback_info info) {
  (void)info;
#ifdef _WIN32
  if(job) return napiBool(env,true);
  HANDLE candidate=CreateJobObjectW(NULL,NULL);
  if(!candidate)return napiBool(env,false);
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits={0};
  limits.BasicLimitInformation.LimitFlags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  if(!SetInformationJobObject(candidate,JobObjectExtendedLimitInformation,&limits,sizeof(limits)) || !AssignProcessToJobObject(candidate,GetCurrentProcess())){CloseHandle(candidate);return napiBool(env,false);}
  /* Non-inherited handle stays open until process exit. Closing earlier kills this process too. */
  job=candidate;
#endif
  return napiBool(env,true);
}
static void cleanup(void *arg){(void)arg;power(false);}
NAPI_MODULE_INIT() {
  napi_property_descriptor descriptors[]={
    {"now",NULL,now,NULL,NULL,NULL,napi_default,NULL},
    {"setActive",NULL,set_active,NULL,NULL,NULL,napi_default,NULL},
    {"powerHealthy",NULL,power_healthy,NULL,NULL,NULL,napi_default,NULL},
    {"ownProcess",NULL,own_process,NULL,NULL,NULL,napi_default,NULL}
  };
  napi_define_properties(env,exports,4,descriptors);
  napi_add_env_cleanup_hook(env,cleanup,NULL);
  return exports;
}
