#define _POSIX_C_SOURCE 200809L
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <poll.h>
#include <sys/wait.h>
#include <time.h>
#include <errno.h>
static volatile sig_atomic_t stopping=0;
static void stop(int sig){(void)sig;stopping=1;}
static void nap(void){struct timespec d={0,10000000};nanosleep(&d,NULL);}
/* stdin is an exclusive ownership pipe from Node; connector gets /dev/null stdin. */
int main(int argc,char **argv){
  if(argc<2)return 64;
  pid_t owner=getppid();
  signal(SIGTERM,stop);signal(SIGINT,stop);signal(SIGHUP,stop);signal(SIGPIPE,SIG_IGN);
  int ready[2];if(pipe(ready))return 70;
  pid_t child=fork();
  if(child<0)return 70;
  if(child==0){
    close(ready[0]); close(3);
    signal(SIGTERM,SIG_DFL);signal(SIGINT,SIG_DFL);signal(SIGHUP,SIG_DFL);signal(SIGPIPE,SIG_DFL);
    if(setsid()<0)_exit(70);
    if(write(ready[1],"1",1)!=1)_exit(70);close(ready[1]);
    if(!freopen("/dev/null","r",stdin))_exit(70);
    execvp(argv[1],argv+1);_exit(127);
  }
  close(ready[1]);char byte;ssize_t n;
  do{n=read(ready[0],&byte,1);}while(n<0 && errno==EINTR);
  close(ready[0]);
  int status=0, reaped=0;
  if(n!=1)stopping=1;
  if(n==1){char pidline[32];int length=snprintf(pidline,sizeof(pidline),"%ld\n",(long)child);(void)write(3,pidline,(size_t)length);close(3);}
  while(!stopping){
    pid_t result=waitpid(child,&status,WNOHANG);
    if(result==child){reaped=1;break;}
    if(getppid()!=owner){break;}
    struct pollfd input={STDIN_FILENO,POLLIN|POLLHUP,0};
    if(poll(&input,1,100)>0 && (input.revents&(POLLIN|POLLHUP|POLLERR|POLLNVAL))){
      if(read(STDIN_FILENO,&byte,1)<=0)break;
    }
  }
  kill(-child,SIGTERM);
  /* Keep the supervisor alive until descendants have received bounded cleanup. */
  for(int i=0;i<250;i++){
    if(!reaped && waitpid(child,&status,WNOHANG)==child)reaped=1;
    if(kill(-child,0)<0 && errno==ESRCH)break;
    nap();
  }
  kill(-child,SIGKILL);
  if(!reaped)while(waitpid(child,&status,0)<0 && errno==EINTR){}
  return WIFEXITED(status)?WEXITSTATUS(status):128+WTERMSIG(status);
}
